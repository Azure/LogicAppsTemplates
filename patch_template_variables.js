import { readFileSync, writeFile } from 'fs';
import path from 'path';

const workflowSuffix = '_#workflowname#';
const foldersPath = process.argv.slice(2);

const patchTemplateVariables = async (workflowFolderPath, workflowManifest) => {
  const manifestFilePath = `./${workflowFolderPath}/manifest.json`;
  const workflowFilePath = `./${workflowFolderPath}/workflow.json`;
  const workflow = getFileContentInJSON(workflowFilePath);

  console.log(`[${workflowFolderPath}] Patching parameter and connection names...`);

  const { manifest: updatedManifest, workflow: updatedWorkflow } = await updateConnections(workflowManifest, JSON.stringify(workflow));
  const { manifest: finalUpdatedManifest, workflow: finalUpdatedWorkflow} = await updateParameters(updatedManifest, updatedWorkflow);

  writeFile(manifestFilePath, JSON.stringify(finalUpdatedManifest, null, 4), () => {});
  writeFile(workflowFilePath, JSON.stringify(JSON.parse(finalUpdatedWorkflow), null, 4), () => {});

  console.log(`[${workflowFolderPath}] Successfully patched parameter and connection names.`);
};

const verifyMultiWorkflowConnections = (combinedConnections, workflowConnections, workflowFolderPath) => {
  for (const [workflowConnectionKey, workflowConnection] of Object.entries(workflowConnections)) {
    const existingConnectionWithKey = combinedConnections[workflowConnectionKey];
    if (existingConnectionWithKey) {
      const isConnectorIdDifferent = existingConnectionWithKey.connectorId !== workflowConnection.connectorId;
      const isKindDifferent = existingConnectionWithKey.kind !== workflowConnection.kind;

      if (isConnectorIdDifferent || isKindDifferent) {
        console.error(`[${workflowFolderPath}] *Connection validation failed. Connection with key ${workflowConnectionKey} exists with different values: 
          ${
          isConnectorIdDifferent ? `connectorId: ${existingConnectionWithKey.connectorId}, ${workflowConnection.connectorId}. ` : ''
          }${
          isKindDifferent ? `kind: ${existingConnectionWithKey.kind}, ${workflowConnection.kind}.` : ''}\nPlease make sure the connection keys are unique.`);
      }
    }
    combinedConnections[workflowConnectionKey] = workflowConnection;
  }
}

const verifyMultiWorkflowParameters = (combinedParameters, workflowParameters, workflowFolderPath) => {
  for (const workflowParameter of workflowParameters) {
    const existingParameterWithName = combinedParameters[workflowParameter.name];
    if (existingParameterWithName) {
      const isDisplayNameDifferent = existingParameterWithName.displayName !== workflowParameter.displayName;
      const isTypeDifferent = existingParameterWithName.type !== workflowParameter.type;
      const isDescriptionDifferent = existingParameterWithName.description !== workflowParameter.description;
      const isRequiredDifferent = existingParameterWithName.required !== workflowParameter.required;

      if (isDisplayNameDifferent || isTypeDifferent || isDescriptionDifferent || isRequiredDifferent) {
        console.error(`[${workflowFolderPath}] *Parameter validation failed. Parameters with name ${workflowParameter.name} exists with different values: 
          ${
            isDisplayNameDifferent ? `displayName: ${existingParameterWithName.displayName}, ${workflowParameter.displayName}. ` : ''
          }${
            isTypeDifferent ? `type: ${existingParameterWithName.type}, ${workflowParameter.type}. ` : ''}${
              isDescriptionDifferent ? `description: ${existingParameterWithName.description}, ${workflowParameter.description}. ` : ''}${
                isRequiredDifferent ? `required: ${existingParameterWithName.required}, ${workflowParameter.required}. ` : ''}\nPlease make sure the parameter names are unique.`);
      }
    }
    combinedParameters[workflowParameter.name] = workflowParameter;
  }
}

const run = async () => {
  if (foldersPath.length === 0) {
    console.error('There are no template folders specified. Please provide the folders with spaces for multiple template folders, example `npm run patchTemplate folder1 folder2 folder3`');
    return;
  }

  console.log("------------Starting patching templates------------");
  // 1) Patching parameter and connection names with suffix for all workflows
  for (const templateId of foldersPath) {
    const workflowManifests = {};
    
    const templateManifestFilePath = `./${templateId}/manifest.json`;
    const templateManifest = getFileContentInJSON(templateManifestFilePath);

    const combinedConnections = {};
    const combinedParameters = {};

    const templateWorkflowKeys = Object.keys(templateManifest.workflows);
    const isMultiWorkflow = templateWorkflowKeys.length > 1;

    for (const workflowId of templateWorkflowKeys) {
      const workflowManifestFilePath = `./${templateId}/${workflowId}/manifest.json`;
      const workflowManifest = getFileContentInJSON(workflowManifestFilePath);
      await patchTemplateVariables(`${templateId}/${workflowId}`, workflowManifest);
      workflowManifests[workflowId] = workflowManifest;
    }

    if (isMultiWorkflow) {
      for (const workflowId of templateWorkflowKeys) {
        verifyMultiWorkflowConnections(combinedConnections, workflowManifests[workflowId]?.connections, `${templateId}/${workflowId}`);
        verifyMultiWorkflowParameters(combinedParameters, workflowManifests[workflowId]?.parameters, `${templateId}/${workflowId}`);
      }
    }
  }
  console.log("------------Completed patching templates with suffix------------");
};

const updateConnections = async (manifest, workflow) => {
  const updatedConnections = { ...manifest.connections };

  for (const name of Object.keys(manifest.connections)) {
    const connection = manifest.connections[name];

    if (connection.kind?.toLowerCase() === 'shared') {
      connection.connectorId = sanitizeConnectorId(connection.connectorId);
    }

    if (name.endsWith(workflowSuffix)) {
      const oldName = name?.split(workflowSuffix)?.[0];
      workflow = workflow.replaceAll(`"${oldName}"`, `"${name}"`);
    } else {
      const newName = `${name}${workflowSuffix}`;
      workflow = workflow.replaceAll(`"${name}"`, `"${newName}"`);
      updatedConnections[newName] = connection;
      delete updatedConnections[name];
    }
  }

  manifest.connections = updatedConnections;
  return { manifest, workflow };
};

const updateParameters = async (manifest, workflow) => {
  const updatedParameters = [];

  for (const parameter of manifest.parameters) {
    const name = parameter.name;

    if (name.endsWith(workflowSuffix)) {
      const oldName = name?.split(workflowSuffix)?.[0];
      workflow = workflow.replaceAll(`parameters('${oldName}')`, `parameters('${name}')`);
    } else {
      const newName = `${name}${workflowSuffix}`;

      workflow = workflow.replaceAll(`parameters('${name}')`, `parameters('${newName}')`);
      parameter.name = newName;
    }

    updatedParameters.push(parameter);
  }

  manifest.parameters = updatedParameters;
  return { manifest, workflow };
};

const sanitizeConnectorId = (connectorId) => {
  connectorId = (connectorId ?? '').startsWith('/') ? connectorId : `/${connectorId}`;
  const fields = connectorId.split('/');

  if (fields.length !== 9) {
    return connectorId;
  }

  if (fields[1] === 'subscriptions') {
    fields[2] = '#subscription#'
  }

  if (fields[5] === 'locations') {
    fields[6] = '#location#';
  }

  return fields.join('/');
};

const getFileContentInJSON = (filePath) => {
  return JSON.parse(readFileSync(path.resolve(filePath), {
    encoding: 'utf-8'
  }));
};

run();
