import { program } from 'commander';
import { z } from "zod";
import { readFileSync } from 'fs';
import path from 'path';
import { fromError } from 'zod-validation-error';
const manifestSchema = z.object({
    title: z.string(),
    description: z.string(),
    prerequisites: z.string(),
    skus: z.array(z.union([z.literal('standard'), z.literal('consumption')])),
    details: z.object({
        By: z.string(),
        Type: z.union([z.literal('Workflow'), z.literal('Workflow')]),
        Trigger: z.union([z.literal('Request'), z.literal('Recurrence')])
    }),
    tags: z.array(z.string()).optional(),
    kinds: z.array(z.union([z.literal('stateful'), z.literal('stateless')])),
    artifacts: z.array(z.object({ type: z.string(), file: z.string() })),
    images: z.object({ light: z.string(), dark: z.string() }),
    parameters: z.array(
        z.object({
            name: z.string().regex(/^\S*$/),
            displayName: z.string(),
            type: z.union([z.literal('string'), z.literal('boolean'), z.literal('array')]),
            description: z.string(),
            required: z.boolean(),
            allowedValues: z.array(
                z.object({ value: z.string(), displayName: z.string() })
            ).optional()
        })
    ),
    connections: z.record(z.string(), z.object({
        connectorId: z.string(),
        kind: z.string()
    }))
})

program.parse();



const manifestList = JSON.parse(readFileSync(path.resolve('./manifest.json'), {
    encoding: 'utf-8'
}));
for (let folder of manifestList) {
    const manifestFile = JSON.parse(readFileSync(path.resolve(`./${folder}/manifest.json`), {
        encoding: 'utf-8'
    }));
    const result = manifestSchema.safeParse(manifestFile);


    if (!result.success) {
        console.log(`Template Failed Validation: ${folder}`)
        const validationError = fromError(result.error);
        console.error(validationError.toString());
        throw '';
    }

}

console.log("Test Passed")