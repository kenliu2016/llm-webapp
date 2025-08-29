import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, User, Bot, Clock } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  model?: string;
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  showTimestamp?: boolean;
  isLast?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  isStreaming = false,
  showTimestamp = false 
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const isUser = message.role === 'user';
  const isDark = document.documentElement.classList.contains('dark');

  const copyToClipboard = async (text: string, codeId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(codeId);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Custom components for react-markdown
  const components = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
      const codeText = String(children).replace(/\n$/, '');

      if (!inline && language) {
        return (
          <div className="relative group my-4">
            <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
              <span className="text-gray-300 text-sm font-medium">{language}</span>
              <button
                onClick={() => copyToClipboard(codeText, codeId)}
                className="flex items-center space-x-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
              >
                {copiedCode === codeId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCode === codeId ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={language}
              PreTag="div"
              className="!mt-0 !rounded-t-none"
              {...props}
            >
              {codeText}
            </SyntaxHighlighter>
          </div>
        );
      }

      return (
        <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    },
    
    pre: ({ children }: any) => (
      <div className="overflow-x-auto">
        {children}
      </div>
    ),

    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100 italic">
        {children}
      </blockquote>
    ),

    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border border-gray-300 dark:border-gray-600">
          {children}
        </table>
      </div>
    ),

    th: ({ children }: any) => (
      <th className="border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-4 py-2 text-left font-semibold">
        {children}
      </th>
    ),

    td: ({ children }: any) => (
      <td className="border border-gray-300 dark:border-gray-600 px-4 py-2">
        {children}
      </td>
    ),
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex max-w-[80%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start space-x-3`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser 
            ? 'bg-blue-600 text-white' 
            : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
        }`}>
          {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Timestamp */}
          {showTimestamp && (
            <div className="flex items-center space-x-1 mb-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{formatTime(message.timestamp)}</span>
              {message.model && !isUser && (
                <>
                  <span>•</span>
                  <span>{message.model}</span>
                </>
              )}
            </div>
          )}

          {/* Message Bubble */}
          <div className={`
            relative px-4 py-3 rounded-2xl max-w-full
            ${isUser 
              ? 'message-user' 
              : 'message-assistant'
            }
            ${isStreaming ? 'animate-pulse-soft' : ''}
            ${isUser ? 'animate-slide-in-right' : 'animate-slide-in-left'}
          `}>
            {isUser ? (
              <p className="text-white whitespace-pre-wrap break-words">
                {message.content}
              </p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={components}
                >
                  {message.content}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-current animate-pulse ml-1">|</span>
                )}
              </div>
            )}
          </div>

          {/* Copy button for assistant messages */}
          {!isUser && !isStreaming && (
            <button
              onClick={() => copyToClipboard(message.content, message.id)}
              className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center space-x-1"
            >
              {copiedCode === message.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedCode === message.id ? 'Copied!' : 'Copy message'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
