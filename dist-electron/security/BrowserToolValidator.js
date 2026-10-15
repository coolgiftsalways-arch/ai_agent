import { z, } from "zod";
const urlSchema = z
    .string()
    .trim()
    .min(1, "Browser URL is required.")
    .max(5000, "Browser URL is too long.")
    .refine((value) => !/[\r\n]/.test(value), {
    message: "Browser URL cannot contain line breaks.",
});
const targetSchema = z
    .string()
    .trim()
    .min(1, "Browser target is required.")
    .max(5000, "Browser target is too long.");
const inputTextSchema = z
    .string()
    .max(100_000, "Browser input text is too long.");
const keySchema = z
    .string()
    .trim()
    .min(1, "Browser key is required.")
    .max(100, "Browser key is too long.");
const emptySchema = z.object({});
const browserSchemas = {
    browser_open: z.object({
        url: urlSchema,
    }),
    browser_read_page: emptySchema,
    browser_get_info: emptySchema,
    browser_click: z.object({
        target: targetSchema,
    }),
    browser_type: z.object({
        target: targetSchema,
        text: inputTextSchema,
    }),
    browser_press: z.object({
        key: keySchema,
    }),
    browser_back: emptySchema,
    browser_forward: emptySchema,
    browser_reload: emptySchema,
    browser_close: emptySchema,
};
export function validateBrowserToolCall(toolName, rawArgs) {
    const schema = browserSchemas[toolName];
    if (!schema) {
        return {
            success: false,
            message: `Unknown browser tool: ${toolName}`,
        };
    }
    let candidate = rawArgs;
    if (typeof candidate ===
        "string") {
        try {
            candidate =
                JSON.parse(candidate);
        }
        catch {
            return {
                success: false,
                message: "Browser tool arguments were not valid JSON.",
            };
        }
    }
    const result = schema.safeParse(candidate ??
        {});
    if (!result.success) {
        return {
            success: false,
            message: result.error.issues
                .map((issue) => issue.message)
                .join("; "),
        };
    }
    return {
        success: true,
        args: result.data,
    };
}
