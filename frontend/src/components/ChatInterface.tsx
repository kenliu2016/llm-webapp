import React, { useState, useEffect, useRef } from 'react';
import { Download, Share2, Settings } from 'lucide-react';
import MessageList from './MessageList';
import InputArea from './InputArea';
import TypingIndicator from './TypingIndicator';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  model?: string;
}

interface ChatInterfaceProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ selectedModel }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mock initial conversation
  useEffect(() => {
    const initialMessages: Message[] = [
      {
        id: '1',
        content: 'Hello! I\'m your AI assistant powered by ChipFoundry Services. How can I help you today?',
        role: 'assistant',
        timestamp: new Date(),
        model: selectedModel,
      },
    ];
    setMessages(initialMessages);
  }, [selectedModel]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string, _attachments?: File[]) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    setStreamingMessage('');

    try {
      // Simulate API call with streaming response
      const response = await simulateStreamingResponse(content, selectedModel);
      
      let accumulatedContent = '';
      for (const chunk of response) {
        accumulatedContent += chunk;
        setStreamingMessage(accumulatedContent);
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate streaming delay
      }

      // Add final message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: accumulatedContent,
        role: 'assistant',
        timestamp: new Date(),
        model: selectedModel,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      // Handle error - could add error message to chat
    } finally {
      setIsTyping(false);
    }
  };

  // Simulate streaming response from AI
  const simulateStreamingResponse = async (userInput: string, model: string): Promise<string[]> => {
    // Mock responses based on input
    const responses = {
      hello: "Hello! I'm happy to help you today. What would you like to know or discuss?",
      code: "Here's a code example for you:\n\n```javascript\nfunction greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet('World'));\n```\n\nThis is a simple JavaScript function that takes a name parameter and returns a greeting.",
      explain: "I'd be happy to explain that concept! Let me break it down into simpler terms with some examples to make it clearer.",
      default: "That's an interesting question! Let me think about this and provide you with a comprehensive answer that covers the key points you're asking about."
    };

    let responseText = responses.default;
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('hello') || lowerInput.includes('hi')) {
      responseText = responses.hello;
    } else if (lowerInput.includes('code') || lowerInput.includes('function')) {
      responseText = responses.code;
    } else if (lowerInput.includes('explain') || lowerInput.includes('what')) {
      responseText = responses.explain;
    }

    // Add model-specific prefix
    const modelPrefix = `*Using ${model}:* `;
    responseText = modelPrefix + responseText;

    // Split into chunks for streaming effect
    const words = responseText.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (currentChunk.length + word.length + 1 < 20) {
        currentChunk += (currentChunk ? ' ' : '') + word;
      } else {
        if (currentChunk) chunks.push(currentChunk + ' ');
        currentChunk = word;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    return chunks;
  };

  const handleExportChat = () => {
    // In real app, this would export chat to PDF/TXT
    console.log('Exporting chat...');
  };

  const handleShareChat = () => {
    // In real app, this would create shareable link
    console.log('Sharing chat...');
  };

  const handleSettings = () => {
    // In real app, this would open settings modal
    console.log('Opening settings...');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse-soft"></div>
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Connected to {selectedModel}
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportChat}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Export chat"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleShareChat}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Share chat"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleSettings}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <MessageList 
          messages={messages}
          streamingMessage={streamingMessage}
          isTyping={isTyping}
        />
        
        {isTyping && !streamingMessage && (
          <div className="px-4 py-2">
            <TypingIndicator />
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <InputArea 
          onSendMessage={handleSendMessage}
          disabled={isTyping}
          placeholder={`Message ${selectedModel}...`}
        />
      </div>
    </div>
  );
};

export default ChatInterface;
