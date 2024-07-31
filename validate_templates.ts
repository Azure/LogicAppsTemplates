import { program } from 'commander';
import { z } from "zod";
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fromError } from 'zod-validation-error';

const manifestSchema = z.object({
    title: z.string(),
    description: z.string(),
    prerequisites: z.string().optional(),
    skus: z.array(z.union([z.literal('standard'), z.literal('consumption')])),
    details: z.object({
        By: z.string().regex(/^[A-Z].*$/, {
            message: 'By field must start with the first letter capitalized'
        }),
        Type: z.union([z.literal('Workflow'), z.literal('Other')]),
        Trigger: z.union([z.literal('Request'), z.literal('Recurrence'), z.literal('Event')]),
        Category: z.string().optional()
    }),
    detailsDescription: z.string().optional(),
    tags: z.array(z.string()).optional(),
    kinds: z.array(z.union([z.literal('stateful'), z.literal('stateless')])),
    artifacts: z.array(z.object({ 
        type: z.union([z.literal('workflow'), z.literal('map'), z.literal('schema'), z.literal('assembly')]),
        file: z.string().regex(/^\S+\.\S+$/, {
            message: 'File field must not contain spaces and must have an extension'
        })
    })),
    images: z.object({ 
        light: z.string(),
        dark: z.string()
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
        }))
})

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

const allowedCategories = ["Design Patterns", "Generative AI", "B2B", "EDI", "Approval", "RAG", "Automation", "BizTalk Migration", "Mainframe Modernization"];

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
    console.console.warn(`Template(s) ${JSON.stringify(templatesNotRegistered)} found in the repository are not registered in manifest.json. Ensure this is intentional.`);
}

for (const folderName of manifestNamesList) {
    const manifestFile = JSON.parse(readFileSync(path.resolve(`./${folderName}/manifest.json`), {
        encoding: 'utf-8'
    }));
    const result = manifestSchema.safeParse(manifestFile);

    if (!result.success) {
        console.log(`Template "${folderName}" Failed Validation`);
        const validationError = fromError(result.error);
        console.error(validationError.toString());
        throw '';
    }

    const invalidLinkPatternMD = z.string().regex(/^.*\[\S+\]\s+\(\S+\).*$/);
      const prerequisitesInvalidPattern = invalidLinkPatternMD.safeParse(manifestFile?.prerequisites ?? "");
      const detailsDescriptionInvalidPattern = invalidLinkPatternMD.safeParse(manifestFile?.detailsDescription ?? "");
      
      if (prerequisitesInvalidPattern.success) {
        console.error(`Template "${folderName}" Failed Validation: prerequisites link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
      }
      if (detailsDescriptionInvalidPattern.success) {
        console.error(`Template "${folderName}" Failed Validation: detailsDescription link is invalid, ensure no space between the [text] and the (link)`);
        throw '';
      }

    if (manifestFile.details?.Category) {
        for (const category of manifestFile.details?.Category?.split(",") ?? []) {
            if (!allowedCategories.includes(category)) {
                console.error(`Template "${folderName}" Failed Validation: Category "${category}" is invalid`);
                throw '';
            }
        }
    }

    // Check all artifacts/images listed in manifest.json exist (case sensitive check)
    const fileNamesInFolder = readdirSync(path.resolve(`./${folderName}`));
    checkFilesExistCaseSensitive(fileNamesInFolder, folderName, manifestFile.artifacts.map((artifact) => artifact.file));
    checkFilesExistCaseSensitive(fileNamesInFolder, folderName, [`${manifestFile.images.light}.png`, `${manifestFile.images.dark}.png`]);

    const workflowFilePath = manifestFile.artifacts.find((artifact) => artifact.type === "workflow")?.file;
    
    if (!workflowFilePath) {
        console.error(`Template "${folderName}" Failed Validation: workflow file not found`);
        throw '';
    }
    const workflowFile = JSON.parse(readFileSync(path.resolve(`./${folderName}/${workflowFilePath}`), {
        encoding: 'utf-8'
    }));
    const workflowFileString = JSON.stringify(workflowFile);

    const parameterNames =  manifestFile.parameters.map(parameter => parameter.name);
    const connectionNames = Object.keys(manifestFile.connections);

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

console.log("Test Passed");
