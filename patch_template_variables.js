import { readFileSync, writeFile } from 'fs';
import path from 'path';

const workflowSuffix = '_#workflowname#';
const foldersPath = process.argv.slice(2);

const patchTemplateVariables = async (folderPath, manifest, isMulti=false) => {
  const manifestFilePath = `./${folderPath}/manifest.json`;
  const workflowFilePath = `./${folderPath}/workflow.json`;
  const workflow = getFileContentInJSON(workflowFilePath);

  console.log(`${isMulti ? "  " : ""}Patching parameter and connection names for ${folderPath}...`);

  const { manifest: updatedManifest, workflow: updatedWorkflow } = await updateConnections(manifest, JSON.stringify(workflow));
  const { manifest: finalUpdatedManifest, workflow: finalUpdatedWorkflow} = await updateParameters(updatedManifest, updatedWorkflow);

  writeFile(manifestFilePath, JSON.stringify(finalUpdatedManifest, null, 4), () => {});
  writeFile(workflowFilePath, JSON.stringify(JSON.parse(finalUpdatedWorkflow), null, 4), () => {});

  console.log(`${isMulti ? "  " : ""}Successfully patched parameter and connection names for ${folderPath}.`);
};

const combineMultiWorkflowConnections = (combinedConnections, workflowConnections) => {
  for (const [workflowConnectionKey, workflowConnection] of Object.entries(workflowConnections)) {
    const existingConnectionWithKey = combinedConnections[workflowConnectionKey];
    if (existingConnectionWithKey) {
      const isConnectorIdDifferent = existingConnectionWithKey.connectorId !== workflowConnection.connectorId;
      const isKindDifferent = existingConnectionWithKey.kind !== workflowConnection.kind;

      if (isConnectorIdDifferent || isKindDifferent) {
        console.error(`*Connection validation failed. Connection with key ${workflowConnectionKey} exists with different values: 
          ${
          isConnectorIdDifferent ? `connectorId: ${existingConnectionWithKey.connectorId}, ${workflowConnection.connectorId}. ` : ''
          }${
          isKindDifferent ? `kind: ${existingConnectionWithKey.kind}, ${workflowConnection.kind}.` : ''}\nPlease make sure the connection keys are unique.`);
        return false;
      }
    }
    combinedConnections[workflowConnectionKey] = workflowConnection;
  }
  return true;
}

const verifyMultiWorkflowParameters = (combinedParameters, workflowParameters) => {
  for (const workflowParameter of workflowParameters) {
    const existingParameterWithName = combinedParameters[workflowParameter.name];
    if (existingParameterWithName) {
      const isDisplayNameDifferent = existingParameterWithName.displayName !== workflowParameter.displayName;
      const isTypeDifferent = existingParameterWithName.type !== workflowParameter.type;
      const isDescriptionDifferent = existingParameterWithName.description !== workflowParameter.description;
      const isRequiredDifferent = existingParameterWithName.required !== workflowParameter.required;

      if (isDisplayNameDifferent || isTypeDifferent || isDescriptionDifferent || isRequiredDifferent) {
        console.error(`*Parameter validation failed. Parameters with name ${workflowParameter.name} exists with different values: 
          ${
            isDisplayNameDifferent ? `displayName: ${existingParameterWithName.displayName}, ${workflowParameter.displayName}. ` : ''
          }${
            isTypeDifferent ? `type: ${existingParameterWithName.type}, ${workflowParameter.type}. ` : ''}${
              isDescriptionDifferent ? `description: ${existingParameterWithName.description}, ${workflowParameter.description}. ` : ''}${
                isRequiredDifferent ? `required: ${existingParameterWithName.required}, ${workflowParameter.required}. ` : ''}\nPlease make sure the parameter names are unique.`);
        return false;
      }
    }
    combinedParameters[workflowParameter.name] = workflowParameter;
  }
  return true;
}

const run = async () => {
  if (foldersPath.length === 0) {
    console.error('There are no template folders specified. Please provide the folders with spaces for multiple template folders, example `npm run patchTemplate folder1 folder2 folder3`');
    return;
  }
  const multiWorkflowManifests = {};
  const allManifests = {};

  console.log("------------Starting patching templates with suffix------------");
  // 1) Patching parameter and connection names with suffix for all workflows
  for (const folderPath of foldersPath) {
    const manifestFilePath = `./${folderPath}/manifest.json`;
    const manifest = getFileContentInJSON(manifestFilePath);

    const isFolderMultiWorkflow = manifest.workflows && Object.keys(manifest.workflows).length > 1;
    if (isFolderMultiWorkflow) {
      console.log(`[Multi-workflow patch start] Patching parameter and connection names for all workflows under: ${folderPath}...`);
      for (const workflowFolderName of Object.keys(manifest.workflows)) {
        const workflowManifestFilePath = `./${folderPath}/${workflowFolderName}/manifest.json`;
        const workflowManifest = getFileContentInJSON(workflowManifestFilePath);
        await patchTemplateVariables(`${folderPath}/${workflowFolderName}`, workflowManifest, true);
        allManifests[workflowManifestFilePath] = workflowManifest;
      }
      console.log(`[Multi-workflow patch success] Successfully patched all parameter and connection names of all workflows under: ${folderPath}.`);
      multiWorkflowManifests[folderPath] = manifest;
    } else {
      await patchTemplateVariables(folderPath, manifest);
    }
  }
  console.log("------------Completed patching templates with suffix------------");

  if (Object.keys(multiWorkflowManifests).length > 0) {
    // 2) Combining connections to each root manifest.json - Sequential after patch
    console.log("------------Starting combining and updating multi-workflow templates connections------------");
    for (const [folderPath, manifest] of Object.entries(multiWorkflowManifests)) {
      console.log(`[Updating connections start] Combining connection names for all workflows under: ${folderPath}...`);
      const combinedConnections = {};
      for (const workflowFolderName of Object.keys(manifest.workflows)) {
        const workflowManifestFilePath = `./${folderPath}/${workflowFolderName}/manifest.json`;
        const workflowManifest = allManifests[workflowManifestFilePath];
        const didCombineSucceed = combineMultiWorkflowConnections(combinedConnections, workflowManifest.connections);
        if (!didCombineSucceed) {
          return;
        }
      }
      manifest.connections = combinedConnections;
      writeFile(`./${folderPath}/manifest.json`, JSON.stringify(manifest, null, 4), () => {});
      console.log(`[Updating connections success] Successfully combined and updated manifest for: ${folderPath}.`);
    }
    console.log("------------Completed combining and updating multi-workflow templates connections------------");

    // 3) Combining featuredOperations to each root manifest.json
    console.log("------------Starting combining and updating multi-workflow templates featuredOperations------------");
    for (const [folderPath, manifest] of Object.entries(multiWorkflowManifests)) {
      console.log(`[Updating featuredOperations start] Combining connection names for all workflows under: ${folderPath}...`);
      const combinedFeaturedOperations = Object.keys(manifest.workflows).flatMap((workflowFolderName) => {
        const workflowManifestFilePath = `./${folderPath}/${workflowFolderName}/manifest.json`;
        const workflowManifest = allManifests[workflowManifestFilePath];
        return workflowManifest.featuredOperations ?? [];
      }).reduce((acc, operation) => {
        if (!acc.some(item => item.type === operation.type)) {
          acc.push(operation); // Add the operation if it's a unique type
        }
        return acc;
      }, []);
      manifest.featuredOperations = combinedFeaturedOperations;
      writeFile(`./${folderPath}/manifest.json`, JSON.stringify(manifest, null, 4), () => {});
      console.log(`[Updating featuredOperations success] Successfully combined and updated manifest for: ${folderPath}.`);
    }
    console.log("------------Completed combining and updating multi-workflow templates featuredOperations------------");

    // 4) Checking parameters with keys have the same values
    console.log("------------Verifying multi-workflow templates parameters------------");
    for (const [folderPath, manifest] of Object.entries(multiWorkflowManifests)) {
      console.log(`[Verifying parameters start] Checking parameter names for all workflows under: ${folderPath}...`);
      const combinedParameters = {};
      for (const workflowFolderName of Object.keys(manifest.workflows)) {
        const workflowManifestFilePath = `./${folderPath}/${workflowFolderName}/manifest.json`;
        const workflowManifest = allManifests[workflowManifestFilePath];
        const didVerificationSucceed = verifyMultiWorkflowParameters(combinedParameters, workflowManifest.parameters);
        if (!didVerificationSucceed) {
          return;
        }
      }
      console.log(`[Verified parameters success] Successfully checked parameter names for all workflows under: ${folderPath}.`);
    }
    console.log("------------Completed verifying multi-worklfow templates parameters------------");
  }
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
      workflow = workflow.replaceAll(`'${oldName}'`, `'${name}'`);
    } else {
      const newName = `${name}${workflowSuffix}`;
      workflow = workflow.replaceAll(`"${name}"`, `"${newName}"`);
      workflow = workflow.replaceAll(`'${name}'`, `'${newName}'`);
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

    if (!name.endsWith(workflowSuffix)) {
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
