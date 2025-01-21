import { program } from 'commander';
import { z } from "zod";
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fromError } from 'zod-validation-error';

const allowedCategories = ["Design Patterns", "AI", "B2B", "EDI", "Approval", "RAG", "Automation", "BizTalk Migration", "Mainframe Modernization"];

const templateManifestSchema = z.object({
    title: z.string(),
    description: z.string(),
    detailsDescription: z.string().optional(),
    artifacts: z.array(z.object({ 
        type: z.union([z.literal('map'), z.literal('schema'), z.literal('assembly')]),
        file: z.string().regex(/^\S+\.\S+$/, {
            message: 'File field must not contain spaces and must have an extension'
        })
    })),
    skus: z.array(z.union([z.literal('standard'), z.literal('consumption')])),
    workflows: z.record(
        z.string().regex(/^[a-z-]+$/, {
            message: 'Workflow key must only contain lowercase letters and hyphens'
        }),
        z.object({
            name: z.string().transform((val) => 
                val.replace(/-([a-z])/g, (_, letter) => `_${letter.toUpperCase()}`)
                   .replace(/^[a-z]/, (letter) => letter.toUpperCase())
            ),
        })
    ),
    featuredConnectors: z.array(
        z.object({
            id: z.string().regex(/^\/.*/, {
                message: 'Connections "connectorId" field must start with a forward slash'
            }),
            kind: z.union([z.literal('inapp'), z.literal('shared'), z.literal('custom')])
        })
    ),
    details: z.object({
        By: z.string().regex(/^[A-Z].*$/, {
            message: 'By field must start with the first letter capitalized'
        }),
        Type: z.union([z.literal('Workflow'), z.literal('Accelerator')]),
        Category: z.string().optional(),
        Trigger: z.union([z.literal('Request'), z.literal('Recurrence'), z.literal('Event'), z.literal('Automated'), z.literal('Scheduled')]).optional(),

    }),
    tags: z.array(z.string()).optional(),
});

const workflowManifestSchema = z.object({
    title: z.string(),
    description: z.string(),
    detailsDescription: z.string().optional(),
    prerequisites: z.string().optional(),
    kinds: z.array(z.union([z.literal('stateful'), z.literal('stateless')])),
    artifacts: z.array(z.object({ 
        type: z.literal('workflow'),
        file: z.string().regex(/^\S+\.\S+$/, {
            message: 'Workflow File field must not contain spaces and must have an extension'
        })
    })),
    images: z.object({
        light: z.string().regex(/^[a-z-_]+$/, {
            message: 'Image field must only contain lowercase letters, hyphens, and underscore'
        }),
        dark: z.string().regex(/^[a-z-_]+$/, {
            message: 'Image field must only contain lowercase letters, hyphens, and underscore'
        })
    }),
    parameters: z.array(
        z.object({
            name: z.string().regex(/^\S*_#workflowname#$/, {
                message: 'parameters "name" field must end with _#workflowname#'
            }),
            displayName: z.string().regex(/^[A-Z].*$/, {
                message: 'parameters "displayName" field must start with the first letter capitalized. Suggested naming convention: "Display Name" (O), "display-name" (X)'
            }),
            type: z.union([z.literal('String'), z.literal('Bool'), z.literal('Array'), z.literal('Float'), z.literal('Int'), z.literal('Object')]),
            description: z.string(),
            required: z.boolean(),
            allowedValues: z.array(
                z.object({ value: z.string(), displayName: z.string() })
            ).optional()
        })
    ),
    connections: z.record(
        z.string().regex(/^\S*_#workflowname#$/, {
            message: 'connections "name" field must end with _#workflowname#'
        }), 
        z.object({
            connectorId: z.string().regex(/^\/.*/, {
                message: 'Connections "connectorId" field must start with a forward slash'
            }),
            kind: z.union([z.literal('inapp'), z.literal('shared'), z.literal('custom')]),
        })),    
});

program.parse();

const manifestNamesList: string[] = JSON.parse(readFileSync(path.resolve('./manifest.json'), {
    encoding: 'utf-8'
}));
const allManifestDirectories = readdirSync("./").filter(file => 
    statSync(path.join("./", file)).isDirectory() && existsSync(path.join("./", file, "manifest.json"))
);

const checkFilesExistCaseSensitive = (fileNamesInFolder: string[], folderName: string, listedFileNames: string[]) => {
    for (const fileName of listedFileNames) {
        if (!fileNamesInFolder.includes(fileName)) {
            console.error(`Template Failed Validation: ${`./${folderName}/${fileName}`} not found`);
            throw '';
        }
    }
}

const invalidLinkPatternMD = z.string().regex(/^.*\[\S+\]\s+\(\S+\).*$/);

const validateTemplateManifest = (folderName: string, templateManifest) => {
    const descriptionInvalidPattern = invalidLinkPatternMD.safeParse(templateManifest?.description ?? "");
    const detailsDescriptionInvalidPattern = invalidLinkPatternMD.safeParse(templateManifest?.detailsDescription ?? "");
    
    if (descriptionInvalidPattern.success) {
        console.error(`Template Manifest "${folderName}" Failed Validation: detail link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
    }
    if (detailsDescriptionInvalidPattern.success) {
        console.error(`Template Manifest "${folderName}" Failed Validation: detailsDescription link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
    }

    const workflowsCount = Object.keys(templateManifest?.workflows ??{}).length;
    const workflowTypeByCount = workflowsCount === 1 ? "Workflow" : workflowsCount > 1 ? "Accelerator" : undefined;
    if (templateManifest.details.Type !== workflowTypeByCount) {
        console.error(`Template Manifest "${folderName}" Failed Validation: ${
            workflowsCount ? `There are ${workflowsCount} workflows, please ensure "details.Type" is ${workflowTypeByCount}` : "None of the workflows are registered in the manifest.json."
        }`);
        throw '';
    }

    if (templateManifest.details?.Category) {
        for (const category of templateManifest.details?.Category?.split(",") ?? []) {
            if (!allowedCategories.includes(category)) {
                console.error(`Template Manifest "${folderName}" Failed Validation: Category "${category}" is invalid`);
                throw '';
            }
        }
    }

    if (templateManifest.tags?.some((tag) => tag.includes(","))) {
        console.error(`Template Manifest "${folderName}" Failed Validation: Tags should be separate strings, not one string separated by ","`);
        throw '';
    }

    // Check all artifacts/images listed in manifest.json exist (case sensitive check)
    const fileNamesInFolder = readdirSync(path.resolve(`./${folderName}`));
    checkFilesExistCaseSensitive(fileNamesInFolder, folderName, templateManifest.artifacts.map((artifact) => artifact.file));

    // Note: Disabled the check for now as we have "sample" artifacts that don't fall under the defined artifact types

    // const allArtifactsInFolder = readdirSync(`./${folderName}`).filter(file => 
    //     !file.endsWith(".png") && file !== "manifest.json"
    // );

    // // Give warning if all the artifacts in the template/manifest.json is not registered
    // const allRegisteredArtifacts = manifestFile.artifacts.map(artifact => artifact.file);
    // const artifactsNotRegistered = allArtifactsInFolder.filter(item => !allRegisteredArtifacts.includes(item));
    // if (artifactsNotRegistered.length) {
    //     console.error(`Artifacts(s) ${JSON.stringify(artifactsNotRegistered)} found in the repository not registered in ${folderName}/manifest.json.`);
    //     throw '';
    // }
}

const getUnusedConnectors = (workflowConnections, featuredConnectors) => {
    return featuredConnectors.filter(value => !workflowConnections.some((item: any) => item.connectorId === value.id && item.kind === value.kind));
}

const validateWorkflowManifest = (folderName: string, workflowManifest) => {
    const prerequisitesInvalidPattern = invalidLinkPatternMD.safeParse(workflowManifest?.prerequisites ?? "");
    const descriptionInvalidPattern = invalidLinkPatternMD.safeParse(workflowManifest?.description ?? "");
    const detailsDescriptionInvalidPattern = invalidLinkPatternMD.safeParse(workflowManifest?.detailsDescription ?? "");
    
    if (prerequisitesInvalidPattern.success) {
        console.error(`Workflow Manifest "${folderName}" Failed Validation: prerequisites link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
    }
    if (descriptionInvalidPattern.success) {
        console.error(`Workflow Manifest "${folderName}" Failed Validation: detail link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
    }
    if (detailsDescriptionInvalidPattern.success) {
        console.error(`Workflow Manifest "${folderName}" Failed Validation: detailsDescription link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
    }

    // Check all artifacts/images listed in manifest.json exist (case sensitive check)
    const fileNamesInFolder = readdirSync(path.resolve(`./${folderName}`));
    checkFilesExistCaseSensitive(fileNamesInFolder, folderName, workflowManifest.artifacts.map((artifact) => artifact.file));
    checkFilesExistCaseSensitive(fileNamesInFolder, folderName, [`${workflowManifest.images.light}.png`, `${workflowManifest.images.dark}.png`]);

    const workflowFilePath = workflowManifest.artifacts.find((artifact) => artifact.type === "workflow")?.file;
    if (!workflowFilePath) {
        console.error(`Workflow Manifest "${folderName}" Failed Validation: workflow file not found`);
        throw '';
    }
    const workflowFile = JSON.parse(readFileSync(path.resolve(`./${folderName}/${workflowFilePath}`), {
        encoding: 'utf-8'
    }));

    if (workflowFile.definition || workflowFile.kind) {
        console.error(`Workflow "./${folderName}/${workflowFilePath}" Failed Validation: workflow.json is invalid - please only keep what's under "definition"`);
        throw '';
    }

    const workflowFileString = JSON.stringify(workflowFile);

    const parameterNames =  workflowManifest.parameters.map(parameter => parameter.name);
    const connectionNames = Object.keys(workflowManifest.connections);

    const parameterMatches = workflowFileString.matchAll(/@parameters\('\s*([^"]+)\s*'\)/g);
    for (const match of parameterMatches) {
        if (!parameterNames.includes(match[1])) {
            console.error(`Workflow "${folderName}" Failed Validation: parameter "${match[1]}" not found in manifest.json. Hint: Make sure the parameter name is in the format <parameterName>_#workflowname#`);
            throw '';
        }
    }
    
    const connectionReferenceMatches = workflowFileString.matchAll(/"connection":\s*\{\s*"referenceName":\s*"([^"]+)"\}/g);
    for (const match of connectionReferenceMatches) {
        if (!connectionNames.includes(match[1])) {
            console.error(`Workflow "${folderName}" Failed Validation: connection used in "referenceName": "${match[1]}" not found in manifest.json. Hint: Make sure the connection name is in the format <connectionName>_#workflowname#`);
            throw '';
        }
    }

    const connectionNameMatches = workflowFileString.matchAll(/"connectionName":\s*"([^"]+)"/g);
    for (const match of connectionNameMatches) {
        if (!connectionNames.includes(match[1])) {
            console.error(`Workflow "${folderName}" Failed Validation: connection used in "connectionName": "${match[1]}" not found in manifest.json. Hint: Make sure the connection name is in the format <connectionName>_#workflowname#`);
            throw '';
        }
    }
}

const manifestNamesSet = new Set(manifestNamesList);
if (manifestNamesSet.size !== manifestNamesList.length) {
    console.error(`manifest.json contains ${manifestNamesList.length - manifestNamesSet.size} duplicate Template name(s)`);
    throw '';
}

// Check all registered folders in manifest.json exist with another manifest.json
const registeredNotExisting = manifestNamesList.filter(item => !allManifestDirectories.includes(item));
if (registeredNotExisting.length) {
    console.error(`Template(s) registered in manifest.json: ${JSON.stringify(registeredNotExisting)} not found in the repository`);
    throw '';
}

// Give warning if all the folders in the repo is registered in the main manifest.json
const templatesNotRegistered = allManifestDirectories.filter(item => !manifestNamesList.includes(item));
if (templatesNotRegistered.length) {
    console.error(`Template(s) ${JSON.stringify(templatesNotRegistered)} found in the repository are not registered in manifest.json.`);
    throw '';
}

for (const folderName of manifestNamesList) {
    const templateManifest = JSON.parse(readFileSync(path.resolve(`./${folderName}/manifest.json`), {
        encoding: 'utf-8'
    }));

    const result = templateManifestSchema.safeParse(templateManifest);

    if (!result.success) {
        console.log(`Template Manifest "${folderName}" Failed Validation`);
        const validationError = fromError(result.error);
        console.error(validationError.toString());
        throw '';
    }

    validateTemplateManifest(folderName, templateManifest);

    let unregistered_featuredConnectors = [...(templateManifest?.featuredConnectors ?? [])];

    for (const workflowFolder of Object.keys(templateManifest.workflows)) {
        const workflowManifest = JSON.parse(readFileSync(path.resolve(`./${folderName}/${workflowFolder}/manifest.json`), {
            encoding: 'utf-8'
        }));
        const subManifestResult = workflowManifestSchema.safeParse(workflowManifest);
        if (!subManifestResult.success) {
            console.log(`Workflow Manifest "${folderName}/${workflowFolder}" Failed Validation`);
            const validationError = fromError(subManifestResult.error);
            console.error(validationError.toString());
            throw '';
        }
        validateWorkflowManifest(`${folderName}/${workflowFolder}`, workflowManifest);

        unregistered_featuredConnectors = getUnusedConnectors(Object.values(workflowManifest.connections), unregistered_featuredConnectors);
    }

    if (unregistered_featuredConnectors?.length) {
        console.error(`Template Manifest "${folderName}" Failed Validation: Featured connectors ${JSON.stringify(unregistered_featuredConnectors)} are not used in any workflow`);
        throw '';
    }
}

console.log("Test Passed");