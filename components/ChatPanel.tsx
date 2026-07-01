"use client";

import { useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUpIcon, MessageCircleDashedIcon } from "lucide-react";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message";
import InterfazeLogo from "@/components/InterfazeLogo";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import Markdown from "@/components/Markdown";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";

function messageText(parts: UIMessage["parts"]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

// Keeps the viewport pinned to the newest content while a response streams in.
// `signal` changes on every token, so the effect re-fires as text grows.
function StreamAutoScroll({ signal, active }: { signal: string; active: boolean }) {
  const { scrollToEnd } = useMessageScroller();
  useEffect(() => {
    if (active) scrollToEnd();
  }, [signal, active, scrollToEnd]);
  return null;
}

export default function ChatPanel() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  const isBusy = status === "submitted" || status === "streaming";
  const lastMessage = messages[messages.length - 1];
  const waiting = isBusy && lastMessage?.role === "user";
  // Grows with every streamed token → drives StreamAutoScroll.
  const streamSignal = lastMessage
    ? `${messages.length}:${messageText(lastMessage.parts).length}`
    : "";

  function send() {
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <section
      className="panel animate-fade-up flex h-[640px] max-h-[80vh] flex-col overflow-hidden"
      style={{ animationDelay: "320ms" }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium tracking-tight text-zinc-100">
            Interfaze
          </h2>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          {messages.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircleDashedIcon />
                </EmptyMedia>
                <EmptyTitle>Chat with your Box docs</EmptyTitle>
                <EmptyDescription>
                  Ask a question about your indexed Box documents.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MessageScroller className="h-full">
              <MessageScrollerViewport className="no-scrollbar p-4">
                <MessageScrollerContent aria-busy={isBusy} className="justify-end">
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <MessageScrollerItem key={m.id} messageId={m.id}>
                        <Message align={isUser ? "end" : "start"}>
                          {!isUser && (
                            <MessageAvatar className="size-8 rounded-lg bg-white p-1.5">
                              <InterfazeLogo className="w-full" />
                            </MessageAvatar>
                          )}
                          <MessageContent>
                            <Bubble
                              align={isUser ? "end" : "start"}
                              variant={isUser ? "default" : "muted"}
                              className="animate-msg-in"
                            >
                              <BubbleContent
                                className={isUser ? "whitespace-pre-wrap" : ""}
                              >
                                {isUser ? (
                                  messageText(m.parts)
                                ) : (
                                  <Markdown>{messageText(m.parts)}</Markdown>
                                )}
                              </BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })}

                  {waiting && (
                    <MessageScrollerItem messageId="__thinking__">
                      <Message align="start">
                        <MessageAvatar className="size-8 rounded-lg bg-white p-1.5">
                          <InterfazeLogo className="w-full" />
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble align="start" variant="muted" className="animate-msg-in">
                            <BubbleContent>
                              <span className="shimmer">Thinking…</span>
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  )}

                  {error && (
                    <MessageScrollerItem messageId="__error__">
                      <Marker className="text-destructive">
                        <MarkerContent>
                          Something went wrong: {error.message}
                        </MarkerContent>
                      </Marker>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>

              <MessageScrollerButton />
              <StreamAutoScroll signal={streamSignal} active={isBusy} />
            </MessageScroller>
          )}
        </MessageScrollerProvider>
      </div>

      <div className="border-t border-white/8 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="w-full"
        >
          <InputGroup>
            <InputGroupTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your documents..."
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                disabled={isBusy || input.trim().length === 0}
                aria-label="Send message"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </section>
  );
}
