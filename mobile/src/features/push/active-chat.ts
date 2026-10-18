// Which chat the user is looking at right now. The chat screen calls
// setActiveConversation(id) when it opens and setActiveConversation(null)
// when it closes, so a push for the chat you are already reading is not shown.

let activeConversationId: string | null = null;

export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

export function getActiveConversation(): string | null {
  return activeConversationId;
}
