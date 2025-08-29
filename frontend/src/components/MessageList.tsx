import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  model?: string;
}

interface MessageListProps {
  messages: Message[];
  streamingMessage?: string;
  isTyping: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ 
  messages, 
  streamingMessage, 
  isTyping 
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  return (
    <div 
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto px-4 py-6 space-y-6"
    >
      {messages.length === 0 && !isTyping && (
        <div className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">CF</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Welcome to ChipFoundry AI Chat
          </h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            Start a conversation with our AI assistant. Ask questions, get code help, 
            or explore any topic you're curious about.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 max-w-lg">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Code Help
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Get assistance with programming and development
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Explanations
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Learn about complex topics in simple terms
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Writing
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Help with writing, editing, and content creation
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                Analysis
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Data analysis and problem-solving assistance
              </p>
            </div>
          </div>
        </div>
      )}

      {messages.map((message, index) => (
        <div key={message.id} className="animate-fade-in">
          <MessageBubble
            message={message}
            showTimestamp={
              index === 0 || 
              message.timestamp.getTime() - messages[index - 1].timestamp.getTime() > 300000 // 5 minutes
            }
            isLast={index === messages.length - 1}
          />
        </div>
      ))}

      {/* Streaming message */}
      {streamingMessage && (
        <div className="animate-fade-in">
          <MessageBubble
            message={{
              id: 'streaming',
              content: streamingMessage,
              role: 'assistant',
              timestamp: new Date(),
            }}
            isStreaming={true}
            showTimestamp={false}
            isLast={true}
          />
        </div>
      )}

      {/* Typing indicator */}
      {isTyping && !streamingMessage && (
        <div className="animate-fade-in">
          <TypingIndicator isVisible={true} />
        </div>
      )}
    </div>
  );
};

export default MessageList;
