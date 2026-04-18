import { NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["vi", "en", "ja", "zh"];

export async function GET() {
  return NextResponse.json({ locales: SUPPORTED_LOCALES });
}
