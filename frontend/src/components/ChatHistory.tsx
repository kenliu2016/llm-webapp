import React, { useState, useEffect } from 'react';
import { MessageCircle, Search, Trash2, Plus, MoreVertical, Calendar } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messageCount: number;
}

const ChatHistory: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  // Mock data - in real app, this would come from API
  useEffect(() => {
    const mockSessions: ChatSession[] = [
      {
        id: '1',
        title: 'JavaScript Optimization Tips',
        lastMessage: 'Thanks for the performance optimization suggestions!',
        timestamp: new Date('2025-08-26T10:30:00'),
        messageCount: 12,
      },
      {
        id: '2',
        title: 'React Component Design',
        lastMessage: 'How can I make this component more reusable?',
        timestamp: new Date('2025-08-26T09:15:00'),
        messageCount: 8,
      },
      {
        id: '3',
        title: 'TypeScript Best Practices',
        lastMessage: 'What are the latest TypeScript features I should use?',
        timestamp: new Date('2025-08-25T16:45:00'),
        messageCount: 15,
      },
      {
        id: '4',
        title: 'Database Query Optimization',
        lastMessage: 'These indexing strategies look great!',
        timestamp: new Date('2025-08-25T14:20:00'),
        messageCount: 6,
      },
      {
        id: '5',
        title: 'Machine Learning Concepts',
        lastMessage: 'Can you explain gradient descent in simple terms?',
        timestamp: new Date('2025-08-24T11:00:00'),
        messageCount: 20,
      },
    ];
    setSessions(mockSessions);
    setSelectedSession(mockSessions[0].id);
  }, []);

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    session.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupSessionsByDate = (sessions: ChatSession[]) => {
    const groups: { [key: string]: ChatSession[] } = {};
    
    sessions.forEach(session => {
      const date = session.timestamp.toDateString();
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      let groupKey;
      if (date === today) {
        groupKey = 'Today';
      } else if (date === yesterday) {
        groupKey = 'Yesterday';
      } else {
        groupKey = session.timestamp.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(session);
    });
    
    return groups;
  };

  const sessionGroups = groupSessionsByDate(filteredSessions);

  const handleNewChat = () => {
    // In real app, this would create a new chat session
    console.log('Creating new chat...');
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (selectedSession === sessionId) {
      setSelectedSession(null);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center justify-center space-x-2 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="font-medium">New Chat</span>
        </button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {Object.entries(sessionGroups).map(([groupName, groupSessions]) => (
          <div key={groupName} className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {groupName}
              </span>
            </div>
            
            {groupSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setSelectedSession(session.id)}
                className={`chat-history-item group ${
                  selectedSession === session.id ? 'active' : ''
                } animate-fade-in`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <MessageCircle className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {session.title}
                      </h3>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                          aria-label="Delete conversation"
                        >
                          <Trash2 className="w-3 h-3 text-gray-500" />
                        </button>
                        <button className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">
                          <MoreVertical className="w-3 h-3 text-gray-500" />
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {session.lastMessage}
                    </p>
                    
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">
                        {formatTime(session.timestamp)}
                      </span>
                      <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                        {session.messageCount} messages
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {filteredSessions.length === 0 && searchQuery && (
          <div className="text-center py-8">
            <Search className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No conversations found matching "{searchQuery}"
            </p>
          </div>
        )}

        {sessions.length === 0 && (
          <div className="text-center py-8">
            <MessageCircle className="w-8 h-8 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No conversations yet. Start a new chat!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHistory;
