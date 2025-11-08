# Aggregate messages from Azure Service Bus by CorrelationId

## Overview

This workflow template implements the **Aggregator enterprise integration pattern** for Azure Logic Apps Standard, designed to facilitate **migration from BizTalk Server** to Azure. The template retrieves messages from an Azure Service Bus queue in batches, decodes flat file content using an XSD schema, and groups messages by their CorrelationId property.

This template replicates the functionality of BizTalk Server's Aggregator pattern, providing a cloud-native alternative that leverages Azure Logic Apps Standard capabilities while maintaining compatibility with existing BizTalk flat file schemas and integration patterns.

## Pattern description

The **Aggregator pattern** is an Enterprise Integration Pattern that collects related messages and combines them into a single, consolidated message. This template uses the CorrelationId property from Azure Service Bus messages to identify which messages belong together, making it ideal for scenarios where multiple related messages need to be processed as a unit.

**For BizTalk Server users**: This pattern is equivalent to BizTalk's **Aggregator pattern with sequential convoy processing**. In BizTalk terminology:
- **Aggregator pattern** = The overall pattern (WHAT: collecting and combining related messages)
- **Sequential convoy** = The implementation mechanism (HOW: processing correlated messages one-by-one using correlation sets)

This Logic Apps workflow combines both concepts: it implements the Aggregator pattern using sequential message processing within each batch, similar to how BizTalk orchestrations process convoy messages.

## Architecture

- **Trigger**: Azure Service Bus queue (peek-lock, non-session, batch mode)
- **Processing**: Sequential in-memory aggregation with flat file decoding
- **Output**: HTTP response with aggregated results grouped by CorrelationId
- **Error handling**: Scope-based error capture with detailed logging

## Use cases

This template is useful for the following scenarios:

- **BizTalk Aggregator pattern migration**: Migrate BizTalk orchestrations that use Aggregator pattern with sequential or parallel convoy processing to Azure Logic Apps Standard
- **Order processing**: Aggregate multiple order line items (separate messages) into a complete order document
- **Document assembly**: Combine document fragments into a complete document (EDI segments, flat file records)
- **Data collection**: Group related telemetry or sensor data by device ID for batch analysis
- **Multi-step workflows**: Collect results from parallel operations using a correlation identifier before proceeding
- **Message batching**: Consolidate multiple messages with same business key for downstream processing

### BizTalk Server migration considerations

If you're migrating from BizTalk Server, this template provides equivalent functionality for:

**BizTalk Aggregator Pattern Components:**
- **Correlation Sets** → **CorrelationId property**: Messages are grouped using Service Bus CorrelationId (equivalent to BizTalk correlation sets)
- **Sequential Convoy** → **Sequential processing**: Set `EnableSequentialProcessing=true` to process correlated messages one-by-one (equivalent to BizTalk sequential convoy orchestrations)
- **Message Collection** → **In-memory variables**: Uses `CorrelationGroups` dictionary to collect messages (equivalent to BizTalk orchestration variables)
- **XSD Schemas** → **Flat File Decoding**: Reuse your existing BizTalk flat file schemas without modification
- **Exception Blocks** → **Scope-based error handling**: Similar error capture and logging as BizTalk exception handlers
- **Receive Location Batching** → **Service Bus batch trigger**: Comparable to BizTalk receive locations with batching enabled

**Key Pattern Mapping:**
- This workflow = BizTalk **Aggregator Orchestration** with **Sequential Convoy**
- NOT a parallel convoy (which would be `EnableSequentialProcessing=false`)

**Pattern Hierarchy:**
```
AGGREGATOR PATTERN (Enterprise Integration Pattern)
├── Purpose: Collect and combine related messages
├── Identifies messages by: CorrelationId property
│
└── Implementation Mechanism: SEQUENTIAL CONVOY
    ├── Processes messages: One-by-one in order
    ├── Maintains: Message order and variable consistency
    └── Alternative: Parallel Convoy (faster, no order guarantee)
```

**BizTalk Orchestration Equivalent:**
```csharp
// BizTalk Aggregator with Sequential Convoy
[CorrelationSet: OrderCorrelation]
while (receivedCount < expectedCount)
{
    Receive(OrderLinePort);           // Sequential convoy
    orderLines.Add(currentMessage);    // Aggregation
}
CompleteOrder = Aggregate(orderLines); // Aggregator pattern result
Send(CompleteOrderPort);
```

**Logic Apps Workflow Equivalent:**
```json
Trigger: Service Bus (batch mode)
↓
ForEach Message (sequential: concurrency=1)  ← Sequential convoy
    Extract CorrelationId                    ← Correlation set
    Decode flat file
    Add to CorrelationGroups[corrId]         ← Aggregation
↓
Build AggregatedResults                      ← Aggregator pattern result
Return HTTP Response
```

## Prerequisites

Before you use this template, make sure that you have the following resources:

### Azure Service Bus namespace and queue

You need an Azure Service Bus namespace with a non-session queue configured:

- **Sessions enabled**: Must be set to `false`
- **Lock duration**: At least 30 seconds (recommended: 5 minutes for large batches)
- **Max delivery count**: Configure based on your retry policy (recommended: 10)

For more information, see [Create an Azure Service Bus namespace and queue](https://learn.microsoft.com/azure/service-bus-messaging/service-bus-quickstart-portal).

### Flat file schema (XSD)

You need an XSD schema that defines the structure of your flat file messages. Upload this schema to your logic app's `Artifacts/Schemas/` folder before deploying the workflow.

**BizTalk Server compatibility**: This template supports BizTalk flat file schemas directly. You can export your existing BizTalk schemas and use them without modification in Azure Logic Apps Standard. The flat file decoding action in Logic Apps uses the same XSD schema format as BizTalk Server.

For more information, see [Create schemas for flat file encoding and decoding](https://learn.microsoft.com/azure/logic-apps/logic-apps-enterprise-integration-flatfile).

### Azure Service Bus connection

You need to configure an Azure Service Bus connection in your logic app. The template uses the built-in Service Bus connector (ServiceProvider) for optimal performance in Azure Logic Apps Standard.

For more information, see [Azure Service Bus connector overview](https://learn.microsoft.com/connectors/servicebus/).

## Template parameters

The template includes the following configurable parameters:

### ServiceBusQueueName_#workflowname#
- **Type**: string
- **Required**: Yes
- **Default**: `"your-queue-name"`
- **Description**: The name of the Azure Service Bus queue to monitor for incoming messages. Replace `your-queue-name` with your actual queue name.

### MaxBatchSize_#workflowname#
- **Type**: integer
- **Required**: Yes
- **Default**: `10`
- **Range**: 1-100
- **Description**: The maximum number of messages to retrieve and process in a single batch. Adjust based on your message size and throughput requirements.
- **Performance guidance**:
  - Small messages (<10KB): Use 50-100 for higher throughput
  - Large messages (>100KB): Use 10-20 to avoid memory issues
  - Strict ordering: Use lower values (5-10) for better control

### FlatFileSchemaName_#workflowname#
- **Type**: string
- **Required**: Yes
- **Default**: `"Invoice.xsd"`
- **Description**: The name of the flat file schema (XSD) to use for decoding message content. This file must exist in your logic app's `Artifacts/Schemas/` folder.

### DefaultCorrelationId_#workflowname#
- **Type**: string
- **Required**: No
- **Default**: `"NO_CORRELATION_ID"`
- **Description**: The fallback value to use when a message does not have a CorrelationId property. Messages with this value are grouped together.

### ServiceBusConnectionName_#workflowname#
- **Type**: string
- **Required**: Yes
- **Default**: `"serviceBus"`
- **Description**: The name of the Azure Service Bus connection reference in your logic app's `connections.json` file.

### EnableSequentialProcessing_#workflowname#
- **Type**: boolean
- **Required**: No
- **Default**: `true`
- **Description**: Controls message processing concurrency **within each batch**:
  - `true`: Processes messages one-by-one sequentially (concurrency=1) to ensure consistent variable updates and avoid race conditions
  - `false`: Allows parallel processing (up to 50 concurrent threads) for higher throughput, but aggregation order may vary
  
**Note**: This setting does NOT control the order in which messages are retrieved from Service Bus. It only controls how messages within a single batch are processed by the workflow.

### ResponseStatusCode

- **Type**: Integer
- **Required**: No
- **Default**: `200`
- **Description**: HTTP status code to return in the response for successful processing. Standard value is 200 (OK).

### ResponseContentType

- **Type**: String
- **Required**: No
- **Default**: `application/json`
- **Description**: Content-Type header value for the HTTP response. Use 'application/json' for JSON-formatted responses.

## How to use this template

### Step 1: Create a logic app workflow from this template

1. In the [Azure portal](https://portal.azure.com), open your Azure Logic Apps Standard resource.
2. On the logic app menu, select **Workflows**.
3. Select **Add** to create a new workflow.
4. In the template gallery, find and select **Aggregate messages from Azure Service Bus by CorrelationId**.
5. Provide values for the required parameters.
6. Select **Create** to create the workflow from the template.

### Step 2: Configure your Azure Service Bus connection

1. On your logic app menu, select **Connections**.
2. Select **Add** to create a new connection.
3. Search for and select **Azure Service Bus (Service Provider)**.
4. Provide your Azure Service Bus connection string.
5. Name the connection to match the `ServiceBusConnectionName_#workflowname#` parameter value.

For more information, see [Azure Service Bus connector overview](https://learn.microsoft.com/connectors/servicebus/).

### Step 3: Upload your flat file schema

1. In your logic app, navigate to the `Artifacts/Schemas/` folder.
2. Upload your XSD schema file.
3. Make sure the file name matches the `FlatFileSchemaName_#workflowname#` parameter value.

### Step 4: Test your workflow

1. Send test messages to your Azure Service Bus queue with CorrelationId properties.
2. Monitor the workflow run history to verify that messages are grouped correctly.
3. Review the HTTP response to see the aggregated results.

## Response format

The workflow returns an HTTP response with the following JSON structure:

```json
{
    "ProcessedBatchSize": 10,
    "UniqueCorrelationIds": 3,
    "AggregatedMessages": [
        {
            "CorrelationId": "order-12345",
            "MessageCount": 5,
            "Messages": [
                {
                    "Invoice": {
                        "InvoiceId": "INV001",
                        "Items": [...]
                    }
                }
            ]
        }
    ],
    "ProcessingTimestamp": "2025-10-31T12:00:00Z",
    "Configuration": {
        "QueueName": "your-queue-name",
        "MaxBatchSize": 10,
        "SchemaName": "Invoice.xsd",
        "SequentialProcessing": true
    }
}
```

The Response action returns the aggregated results as an HTTP response with the configured status code and content type.

## Performance considerations

### Batch size optimization

The `MaxBatchSize_#workflowname#` parameter significantly impacts performance:

| Message size | Recommended batch size | Rationale |
|--------------|----------------------|-----------|
| Small (<10KB) | 50-100 | Maximize throughput with minimal memory impact |
| Medium (10-100KB) | 20-50 | Balance throughput and memory usage |
| Large (>100KB) | 10-20 | Avoid memory issues and timeouts |

### Sequential vs. parallel processing

The `EnableSequentialProcessing_#workflowname#` parameter controls concurrency **within each batch**:

- **Sequential (true)**: 
  - Processes messages one-by-one in the order they appear in the batch
  - Prevents race conditions when updating `CorrelationGroups` variable
  - Easier debugging with predictable execution flow
  - Slower throughput (each message waits for previous to complete)
  
- **Parallel (false)**: 
  - Processes up to 50 messages simultaneously
  - 5-10x faster for large batches
  - Aggregation order within same CorrelationId may vary
  - Risk of race conditions if variables update simultaneously

**Important**: Service Bus peek-lock guarantees FIFO order **only within a session-enabled queue**. This parameter controls processing order **after** messages are retrieved, not the retrieval order itself.

### Lock duration

Configure your Azure Service Bus queue's lock duration to be longer than your workflow's processing time to avoid messages being released back to the queue before processing completes.

## Error handling

The template includes comprehensive error handling:

- **Scope-based error capture**: The `Process_Message_Scope` action wraps all message processing logic
- **Error logging**: Failed messages are logged with details including CorrelationId, MessageId, and error details
- **Continue on error**: The workflow continues processing remaining messages even if some messages fail
- **Error response format**:

```json
{
    "ErrorType": "MessageProcessingFailed",
    "CorrelationId": "order-12345",
    "MessageId": "abc-123",
    "ErrorDetails": {...},
    "Timestamp": "2025-10-31T12:00:00Z"
}
```

## Limitations

Be aware of the following limitations:

- **In-memory aggregation**: All messages in a batch are stored in memory during processing. Workflow execution timeout applies.
- **No cross-batch correlation**: Messages are aggregated only within a single batch. Messages with the same CorrelationId in different batches are not combined.
- **Lock renewal**: The template does not implement automatic lock renewal. Configure your queue's lock duration to exceed your workflow's processing time.
- **In-memory results**: The aggregated results are stored in workflow variables. For persistence, add actions to store results in Azure Storage, Cosmos DB, or other external systems.

## Customization options

You can customize this template to fit your specific needs:

### Add message validation

Insert a condition action after flat file decoding to validate message content before aggregation.

### Implement cross-batch aggregation

Use Azure Storage or Azure Cosmos DB to maintain aggregation state across multiple workflow runs.

### Add dead-letter handling

Configure dead-letter queue processing for messages that fail repeatedly.

### Store aggregated results

Add a Compose or HTTP action after `Log_Processing_Summary` to send results to external systems (Azure Storage, Cosmos DB, Event Hub, etc.).

## Migrating from BizTalk Server

This section provides guidance for organizations migrating BizTalk Server Aggregator patterns to Azure Logic Apps Standard.

### BizTalk to Logic Apps mapping

| BizTalk Server Component | Azure Logic Apps Equivalent | Notes |
|--------------------------|----------------------------|-------|
| Receive Location (with batching) | Service Bus trigger (peek-lock batch) | Use `MaxBatchSize` parameter |
| Flat File Disassembler | Flat File Decoding action | Compatible with BizTalk XSD schemas |
| Correlation Set | CorrelationId property | Use Service Bus message properties |
| Convoy Processing | Sequential processing + grouping | Set `EnableSequentialProcessing=true` |
| Aggregator Orchestration | Foreach + variables | In-memory aggregation with dictionaries |
| Exception Handler | Scope-based error handling | `Process_Message_Scope` and `Handle_Scope_Error` |
| Send Port | HTTP Response or downstream action | Configurable via `ResponseStatusCode` |

### Migration steps

1. **Export BizTalk schemas**: Export your flat file XSD schemas from BizTalk Server
2. **Upload to Logic Apps**: Place schemas in `Artifacts/Schemas/` folder
3. **Configure Service Bus**: Create Azure Service Bus queue to replace BizTalk receive location
4. **Deploy template**: Use this template as a starting point
5. **Test with sample data**: Use existing BizTalk test messages to validate behavior
6. **Adjust parameters**: Fine-tune `MaxBatchSize` and `EnableSequentialProcessing` based on your needs

### Key differences from BizTalk

- **Stateless batching**: Logic Apps processes one batch at a time; cross-batch correlation requires external storage
- **No automatic lock renewal**: Configure queue lock duration longer than workflow execution time
- **Cloud-native**: Leverages Azure platform capabilities (Application Insights, managed identities, etc.)
- **Simpler deployment**: No BizTalk Server infrastructure needed; serverless execution model

### Resources for migration

- [Migrate BizTalk Server applications to Azure Logic Apps](https://learn.microsoft.com/azure/logic-apps/logic-apps-move-from-biztalk)
- [Azure Integration Services](https://azure.microsoft.com/solutions/integration/)
- [BizTalk migration program](https://azure.microsoft.com/migration/biztalk/)

## Troubleshooting

### Messages not being grouped

**Symptom**: All messages have different CorrelationIds in the output.

**Solution**: Verify that your Azure Service Bus messages have the CorrelationId property set. Use the `DefaultCorrelationId_#workflowname#` parameter to identify messages without this property.

### Flat file decoding fails

**Symptom**: The workflow fails with "Schema not found" or decoding errors.

**Solution**:
1. Verify that the XSD schema file exists in `Artifacts/Schemas/`
2. Check that the `FlatFileSchemaName_#workflowname#` parameter matches the file name exactly
3. Validate that your message content matches the schema format

### Workflow times out

**Symptom**: The workflow run exceeds the execution timeout.

**Solution**:
1. Reduce the `MaxBatchSize_#workflowname#` parameter
2. Enable parallel processing by setting `EnableSequentialProcessing_#workflowname#` to `false`
3. Simplify your flat file schema to improve decoding performance

### Connection errors

**Symptom**: "Connection not found" or authentication errors.

**Solution**:
1. Verify that the `ServiceBusConnectionName_#workflowname#` parameter matches your connection name in `connections.json`
2. Check that your Azure Service Bus connection string is valid and has the necessary permissions

## Best practices

Follow these best practices when using this template:

1. **Start with small batches**: Begin with `MaxBatchSize_#workflowname#` set to 10 and increase gradually while monitoring performance.

2. **Monitor run history**: Regularly review workflow run history to identify patterns in message processing times and error rates.

3. **Use Application Insights**: Enable Application Insights integration to track detailed metrics and diagnose issues.

4. **Version your schemas**: Include version numbers in schema file names (for example, `invoice-v1.xsd`) to support schema evolution.

5. **Test error handling**: Send malformed messages to verify that error handling works as expected.

6. **Configure lock duration**: Set your queue's lock duration to at least 2x your average workflow execution time.

## Related templates

You might also be interested in these related templates for BizTalk Server migration and integration patterns:

- **Process messages with session support**: For scenarios requiring strict message ordering and state management (equivalent to BizTalk sequential convoys)
- **Batch message processing**: For simple batch processing without aggregation
- **Content-based router**: For routing messages to different destinations based on content (equivalent to BizTalk content-based routing)
- **Message transformation**: For XML and flat file transformations (equivalent to BizTalk maps)

## Support and feedback

For issues or questions about this template:

- Review the [Azure Logic Apps documentation](https://learn.microsoft.com/azure/logic-apps/)
- Review [BizTalk Server migration guidance](https://learn.microsoft.com/azure/logic-apps/logic-apps-move-from-biztalk)
- Visit the [Azure Logic Apps community forum](https://learn.microsoft.com/answers/tags/140/azure-logic-apps)
- Report issues in the [Azure Logic Apps feedback forum](https://feedback.azure.com/d365community/forum/ca7c5c88-0925-ec11-b6e6-000d3a4f07b8)

## Version history

- **Version 1.0** (2025-11-01): Initial template release for BizTalk Server migration
  - Supports Azure Logic Apps Standard (stateful workflows)
  - Built-in Azure Service Bus connector for optimal performance
  - Flat file decoding with XSD schemas (BizTalk-compatible)
  - CorrelationId-based message grouping (equivalent to BizTalk convoy processing)
  - Comprehensive error handling with Scope-based handlers
  - 8 configurable parameters including response customization
  - Sequential and parallel processing modes
  - HTTP Response action for downstream integration
  - Designed specifically for BizTalk Aggregator pattern migration

## License

This template is provided under the [MIT License](https://opensource.org/licenses/MIT).
