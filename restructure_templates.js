import { mkdir, readFileSync, rename, writeFile } from 'fs';
import path from 'path';

const manifestNamesList = JSON.parse(readFileSync(path.resolve('./manifest.json'), {
    encoding: 'utf-8'
}));

const getNormWorkflowName = (workflowName) => {
    return workflowName
        .replace(/-([a-z])/g, (_, letter) => `_${letter.toUpperCase()}`)
        .replace(/^([a-z])/, (_, letter) => letter.toUpperCase());
};

const connectorIdForBuiltInOperations = {
    chunktext: "connectionProviders/dataOperationNew",
    scope: "connectionProviders/control",
    xslt: "connectionProviders/xmlOperations",
    recurrence: "connectionProviders/schedule",
    request: "connectionProviders/request",
}

const featuredOperationsToConnectors = (featuredOperations) => {
    return featuredOperations?.map((featuredOperation) => {
        const connectorIdForOperation = connectorIdForBuiltInOperations[featuredOperation.type.toLowerCase()];
        if (!connectorIdForOperation) {
            console.error('Connector Id is unknown for this operation :', featuredOperation.type);
            return;
        }
        return {
            id: connectorIdForOperation,
            kind: "builtin",
        };
    }) ?? [];
}

const restructureSingleWorkflow = (folderName, manifestFile) => {
    const nonWorkflowArtifacts = manifestFile.artifacts?.filter((artifact) => artifact.type !== 'workflow') ?? undefined;
    const updatedTemplateManifest = {
        id: folderName,
        title: manifestFile.title,
        summary: manifestFile.description,
        artifacts: (nonWorkflowArtifacts?.length > 0) ? nonWorkflowArtifacts : undefined,
        skus: manifestFile.skus ?? ["standard"],
        workflows: {
            default: {name: getNormWorkflowName(folderName)},
        },
        featuredConnectors: [
            ...featuredOperationsToConnectors(manifestFile?.featuredOperations),
            ...(Object.values(manifestFile?.connections)?.map((connection) => ({
                id: connection.connectorId,
                kind: connection.kind,
            })) ?? [])
        ],
        details: {
            ...(manifestFile.details ?? {}),
            Type: "Workflow",
        },
    }

    if (manifestFile?.tags) {
        updatedTemplateManifest.tags = manifestFile.tags;
    }

    const workflowArtifact = manifestFile.artifacts?.find((artifact) => artifact.type === 'workflow');

    const workflowManifest = {
        id: "default",
        title: manifestFile.title,
        summary: manifestFile.description,
        description: manifestFile.detailsDescription,
        prerequisites: manifestFile.prerequisites,
        kinds: (manifestFile.kinds?.length > 0) ? manifestFile.kinds : undefined,
        artifacts: [workflowArtifact],
        images: {
            light: manifestFile.images.light,
            dark: manifestFile.images.dark
        },
        parameters: manifestFile.parameters,
        connections: manifestFile.connections
    };

    // Overwrite template manifest
    writeFile(`./${folderName}/manifest.json`, JSON.stringify(updatedTemplateManifest, null, 4), () => {});
    // Create subfolder for workflow
    mkdir(`./${folderName}/default`, { recursive: true }, () => {});
    // Create workflow manifest
    writeFile(`./${folderName}/default/manifest.json`, JSON.stringify(workflowManifest, null, 4), () => {});
    // Move images to subfolder
    for (const imageFileName of Object.values(manifestFile.images)) {
        rename(`./${folderName}/${imageFileName}.png`, `./${folderName}/default/${imageFileName}.png`, (err) => {
            if (err) {
                console.error('Error moving file:', err);
                return;
            }
        })
    }
    // Move workflow to subfolder
    rename(`./${folderName}/${workflowArtifact.file}`, `./${folderName}/default/${workflowArtifact.file}`, (err) => {
        if (err) {
            console.error('Error moving file:', err);
            return;
        }
    });
}

const restructureMultiWorkflow = (folderName, templateManifest) => {
    const updatedTemplateManifest = {
        id: folderName,
        title: templateManifest.title,
        summary: templateManifest.description,
        description: templateManifest.detailsDescription,
        artifacts: (templateManifest.artifacts?.length > 0) ? templateManifest.artifacts : undefined,
        skus: ["standard"],
        workflows: templateManifest.workflows,
        featuredConnectors: [
            ...featuredOperationsToConnectors(templateManifest?.featuredOperations),
            ...(templateManifest?.featuredConnectors ?? Object.values(templateManifest?.connections)?.map((connection) => ({
                id: connection.connectorId,
                kind: connection.kind,
            })) ?? [])
        ],
        details: {
            ...(templateManifest.details ?? {}),
            Type: "Accelerator",
        },
    };

    const allTagsCombined = templateManifest?.tags ?? [];

    for (const workflowFolder of Object.keys(templateManifest.workflows)) {
        const workflowManifest = JSON.parse(readFileSync(path.resolve(`./${folderName}/${workflowFolder}/manifest.json`), {
            encoding: 'utf-8'
        }));
        const updatedWorkflowManifest = {
            id: workflowFolder,
            title: workflowManifest.title,
            summary: workflowManifest.description,
            description: workflowManifest.detailsDescription,
            prerequisites: workflowManifest.prerequisites,
            kinds: (workflowManifest.kinds?.length > 0) ? workflowManifest.kinds : undefined,
            artifacts: workflowManifest.artifacts,
            images: {
                light: workflowManifest.images.light,
                dark: workflowManifest.images.dark
            },
            parameters: workflowManifest.parameters,
            connections: workflowManifest.connections
        };
        if (workflowManifest?.tags) {
            allTagsCombined.push(...workflowManifest.tags);
        }
        // Overwrite workflow manifest
        writeFile(`./${folderName}/${workflowFolder}/manifest.json`, JSON.stringify(updatedWorkflowManifest, null, 4), () => {});
    }

    const allUniqueTags = [...new Set(allTagsCombined)];
    if (allUniqueTags.length > 0) {
        updatedTemplateManifest.tags = allUniqueTags;
    }

    // Overwrite template manifest
    writeFile(`./${folderName}/manifest.json`, JSON.stringify(updatedTemplateManifest, null, 4), () => {});
}

const run = async () => {
    for (const folderName of manifestNamesList) {
        const manifestFile = JSON.parse(readFileSync(path.resolve(`./${folderName}/manifest.json`), {
            encoding: 'utf-8'
        }));

        const manifestFileWorkflowsCount = Object.keys(manifestFile?.workflows ?? {}).length;

        // NOTE: restructureMultiWorkflow is idempotent
        if (manifestFileWorkflowsCount > 1) {
            restructureMultiWorkflow(folderName, manifestFile);
        // NOTE: restructureSingleWorkflow is not idempotent - checking if it has been run before
        } else if (manifestFileWorkflowsCount === 0) {
            restructureSingleWorkflow(folderName, manifestFile);
        }
    }
}

run();