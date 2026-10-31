export function authErrorResponse(error: unknown, operation: string) {
  console.error(`[auth:${operation}]`, error);
  const message = error instanceof Error ? error.message : "Unexpected authentication error.";
  const status = message.startsWith("Email delivery is not configured") ? 503 : message.startsWith("Resend rejected") ? 502 : message.startsWith("Configure AUTH_SECRET") ? 503 : 500;
  const userMessage = status === 500 ? "Authentication service failed. Check the server log for the operation details." : message;
  return Response.json({ success: false, message: userMessage }, { status });
}

export function validationError(message: string, status = 400) {
  return Response.json({ success: false, message }, { status });
}
