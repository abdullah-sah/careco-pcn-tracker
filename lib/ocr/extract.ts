import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ExtractedSchema = z.object({
  category: z.enum(["council", "private"]).nullable(),
  pcnNumber: z.string().nullable(),
  authority: z.string().nullable(),
  vehicleReg: z.string().nullable(),
  dateOfPcn: z.string().nullable(), // YYYY-MM-DD
  discountPeriodDays: z.number().int().nullable(),
  fullCost: z.number().nullable(),
  discountedCost: z.number().nullable(),
  cost: z.number().nullable(),
});

export type Extracted = z.infer<typeof ExtractedSchema>;

const PROMPT = `You are reading a UK Parking Charge Notice (PCN) letter image.
Extract these fields. Use null when a field is not present. DO NOT extract the driver's name.
- category: "council" if issued by a local authority/council/TfL, "private" if a private operator (ParkingEye, UKPC, Euro Car Parks, APCOA, etc.)
- pcnNumber, authority (issuing council or company), vehicleReg (uppercase, no spaces if shown that way)
- dateOfPcn as YYYY-MM-DD; discountPeriodDays as an integer number of days
- fullCost and discountedCost in pounds (numbers, no currency symbol). For private notices with a single amount, set "cost" and leave full/discounted null.`;

export async function extractPcn(base64: string, mediaType: string): Promise<Extracted> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const res = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ExtractedSchema) },
  });
  return res.parsed_output ?? {
    category: null, pcnNumber: null, authority: null, vehicleReg: null, dateOfPcn: null,
    discountPeriodDays: null, fullCost: null, discountedCost: null, cost: null,
  };
}
