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

const combineMultiWorkflowConnections = (combinedConnections, workflowConnections, multiWorkflowFolder) => {
  for (const [workflowConnectionKey, workflowConnection] of Object.entries(workflowConnections)) {
    const existingConnectionWithKey = combinedConnections[workflowConnectionKey];
    if (existingConnectionWithKey) {
      const isConnectorIdDifferent = existingConnectionWithKey.connectorId !== workflowConnection.connectorId;
      const isKindDifferent = existingConnectionWithKey.kind !== workflowConnection.kind;

      if (isConnectorIdDifferent || isKindDifferent) {
        console.error(`*Multi-Workflow "${multiWorkflowFolder}" failed validation. Connection with key ${workflowConnectionKey} exists with different values: 
          ${
          isConnectorIdDifferent ? `connectorId: ${existingConnectionWithKey.connectorId}, ${workflowConnection.connectorId}.` : ''
          }${
          isKindDifferent ? `kind: ${existingConnectionWithKey.kind}, ${workflowConnection.kind}.` : ''}\nPlease make sure the connection keys are unique.`);
        return false;
      }
    }
    combinedConnections[workflowConnectionKey] = workflowConnection;
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

  // 2) Combining connections to each root manifest.json - Sequential after patch
  if (Object.keys(multiWorkflowManifests).length > 0) {
    console.log("------------Starting combining and updating multi-workflow templates connections------------");
    for (const [folderPath, manifest] of Object.entries(multiWorkflowManifests)) {
      console.log(`[Updating connections start] Combining connection names for all workflows under: ${folderPath}...`);
      const combinedConnections = {};
      for (const workflowFolderName of Object.keys(manifest.workflows)) {
        const workflowManifestFilePath = `./${folderPath}/${workflowFolderName}/manifest.json`;
        const workflowManifest = allManifests[workflowManifestFilePath];
        const didCombineSucceed = combineMultiWorkflowConnections(combinedConnections, workflowManifest.connections, folderPath);
        if (!didCombineSucceed) {
          return;
        }
      }
      manifest.connections = combinedConnections;
      writeFile(`./${folderPath}/manifest.json`, JSON.stringify(manifest, null, 4), () => {});
      console.log(`[Updating connections success] Successfully combined and updated manifest for: ${folderPath}.`);
    }
    console.log("------------Completed combining and updating multi-workflow templates connections------------");
  }
};

const updateConnections = async (manifest, workflow) => {
  const updatedConnections = { ...manifest.connections };

  for (const name of Object.keys(manifest.connections)) {
    const connection = manifest.connections[name];

    if (connection.kind?.toLowerCase() === 'shared') {
      connection.connectorId = sanitizeConnectorId(connection.connectorId);
    }

    if (!name.endsWith(workflowSuffix)) {
      const newName = `${name}${workflowSuffix}`;

      workflow = workflow.replaceAll(`"${name}"`, `"${newName}"`);
      updatedConnections[newName] = connection;
      delete updatedConnections[name];
    } else {
      updatedConnections[name] = connection;
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
