import { mkdir, readFileSync, writeFile } from 'fs';
import path from 'path';

const manifestNamesList = JSON.parse(readFileSync(path.resolve('./manifest.json'), {
    encoding: 'utf-8'
}));

const restructureSingleWorkflow = async (folderName, manifestFile) => {
    const templateManifest = {
        title: manifestFile.title,
        description: manifestFile.description,
        // detailsDescription: manifestFile.detailsDescription, // will fall under workflow manifest
        artifacts: manifestFile.artifacts?.filter((artifact) => artifact.type !== 'workflow') ?? [],
        skus: manifestFile.skus,
        workflows: {
            [folderName]: folderName
        },
        featuredConnectors: [
            // ...(
            //     manifestFile?.featuredOperations?.map((operation) => {{
            //         id: operation?.type,
                    
            //     }})
            // )
            ...(Object.values(manifestFile?.connections)?.map((connection) => ({
                id: connection.connectorId,
                kind: connection.kind,
            })) ?? [])
        ],
        details: {
            By: manifestFile.details.By,
            Type: manifestFile.details.Type,
            Category: manifestFile.details.Category,
            Trigger: manifestFile.details.Trigger,
        },
    }

    if (manifestFile?.tags) {
        templateManifest.tags = manifestFile.tags;
    }

    const workflowManifest = {
        title: manifestFile.title,
        description: manifestFile.description,
        detailsDescription: manifestFile.detailsDescription,
        prerequisites: manifestFile.prerequisites,
        kinds: manifestFile.kinds,
        artifacts: manifestFile.artifacts?.filter((artifact) => artifact.type === 'workflow') ?? [],
        images: manifestFile.images,
        parameters: manifestFile.parameters,
        connections: manifestFile.connections
    };

    writeFile(`./${folderName}/manifest.json`, JSON.stringify(templateManifest, null, 4), () => {});
    await mkdir(`./${folderName}/${folderName}`, { recursive: true }, () => {});
    writeFile(`./${folderName}/${folderName}/manifest.json`, JSON.stringify(workflowManifest, null, 4), () => {});

}

const run = async () => {
    for (const folderName of manifestNamesList) {
        const manifestFile = JSON.parse(readFileSync(path.resolve(`./${folderName}/manifest.json`), {
            encoding: 'utf-8'
        }));

        if (folderName === 'chat-with-documents-ai') {
            restructureSingleWorkflow('chat-with-documents-ai', manifestFile)
        }

        // const isMultiWorkflowTemplate = Object.keys(manifestFile?.workflows ?? {}).length > 0;

        // if (isMultiWorkflowTemplate) {
        //     await restructureSingleWorkflow(folderName, manifestFile);
        // } else {
        //     await restructureSingleWorkflow(folderName, manifest);
        // }
    }
}

run();