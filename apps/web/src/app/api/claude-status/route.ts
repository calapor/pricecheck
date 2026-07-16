import { NextResponse } from "next/server";
import { isClaudeHalted, CLAUDE_HALTED_MESSAGE } from "@/lib/claude-halt";

// The flag can flip at any time — never cache this response.
export const dynamic = "force-dynamic";

export async function GET() {
  const halted = await isClaudeHalted();
  return NextResponse.json({ halted, message: halted ? CLAUDE_HALTED_MESSAGE : "" });
}
