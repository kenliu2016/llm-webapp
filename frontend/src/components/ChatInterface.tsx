import React, { useState, useEffect, useRef } from 'react';
import { Download, Share2, Settings } from 'lucide-react';
import MessageList from './MessageList';
import InputArea from './InputArea';
import TypingIndicator from './TypingIndicator';
import { chatAPI } from '../services/apiService';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  model?: string;
  tokenCount?: number;
}

interface ChatInterfaceProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ selectedModel }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [currentConversationId, setCurrentConversationId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with a default conversation
  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Try to get existing conversations
        const conversationsResponse = await chatAPI.getConversations();
        let conversationId = currentConversationId;
        
        // If no current conversation or it doesn't exist, create a new one
        if (!conversationId || !conversationsResponse.conversations?.find((c: { id: string }) => c.id === conversationId)) {
          const newConversation = await chatAPI.createConversation({
            title: 'New Conversation',
            model: selectedModel,
            temperature: 0.7,
            maxTokens: 2048
          });
          conversationId = newConversation.conversation.id;
          setCurrentConversationId(conversationId);
        }

        // Get conversation history
        const conversationResponse = await chatAPI.getConversation(conversationId);
        if (conversationResponse.messages && conversationResponse.messages.length > 0) {
          const formattedMessages: Message[] = conversationResponse.messages.map((msg: any) => ({
            id: msg.id,
            content: msg.content,
            role: msg.role as 'user' | 'assistant',
            timestamp: new Date(msg.created_at),
            model: msg.model || selectedModel,
            tokenCount: msg.token_count
          }));
          setMessages(formattedMessages);
        } else {
          // If no messages, add a welcome message
          setMessages([{
            id: Date.now().toString(),
            content: 'Hello! I\'m your AI assistant powered by ChipFoundry Services. How can I help you today?',
            role: 'assistant',
            timestamp: new Date(),
            model: selectedModel,
          }]);
        }
      } catch (error) {
        console.error('Error initializing chat:', error);
        // Fallback to mock message if API call fails
        setMessages([{
          id: '1',
          content: 'Hello! I\'m your AI assistant. How can I help you today?',
          role: 'assistant',
          timestamp: new Date(),
          model: selectedModel,
        }]);
      }
    };

    initializeChat();
  }, [selectedModel, currentConversationId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (content: string, attachments?: File[]) => {
    // If no conversation ID, create one
    if (!currentConversationId) {
      try {
        const newConversation = await chatAPI.createConversation({
          title: 'New Conversation',
          model: selectedModel,
          temperature: 0.7,
          maxTokens: 2048
        });
        setCurrentConversationId(newConversation.conversation.id);
      } catch (error) {
        console.error('Error creating conversation:', error);
        return;
      }
    }

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
      // Process attachments if any
      const attachmentIds: string[] = [];
      if (attachments && attachments.length > 0) {
        for (const file of attachments) {
          try {
            const uploadResponse = await chatAPI.uploadImage(currentConversationId, file);
            if (uploadResponse.files && uploadResponse.files.length > 0) {
              attachmentIds.push(...uploadResponse.files.map((f: any) => f.id));
            }
          } catch (uploadError) {
            console.error('Error uploading file:', uploadError);
          }
        }
      }

      // Send message to backend
      const messageResponse = await chatAPI.sendMessage(currentConversationId, {
        content,
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 2048,
        attachments: attachmentIds
      });

      // Add assistant message
      const assistantMessage: Message = {
        id: messageResponse.message.id,
        content: messageResponse.message.content,
        role: 'assistant',
        timestamp: new Date(),
        model: selectedModel,
        tokenCount: messageResponse.message.token_count
      };

      setMessages(prev => [...prev, assistantMessage]);
      setStreamingMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: 'Sorry, I couldn\'t process your request. Please try again later.',
        role: 'assistant',
        timestamp: new Date(),
        model: selectedModel,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  // Remove the simulateStreamingResponse function since we're using real API calls

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
