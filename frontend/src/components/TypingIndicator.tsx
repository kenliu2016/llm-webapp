import React, { useEffect, useState } from 'react';

interface TypingIndicatorProps {
  isVisible?: boolean;
  userName?: string;
  variant?: 'dots' | 'pulse' | 'wave';
  className?: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ 
  isVisible = false,
  userName = 'AI Assistant',
  variant = 'dots',
  className = ''
}) => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const renderDotsVariant = () => (
    <div className="flex items-center space-x-1">
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
    </div>
  );

  const renderPulseVariant = () => (
    <div className="flex items-center space-x-2">
      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
      <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }}></div>
      <div className="w-1 h-1 bg-blue-300 rounded-full animate-pulse" style={{ animationDelay: '400ms' }}></div>
    </div>
  );

  const renderWaveVariant = () => (
    <div className="flex items-end space-x-1">
      <div className="w-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full animate-wave" style={{ height: '8px', animationDelay: '0ms' }}></div>
      <div className="w-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full animate-wave" style={{ height: '12px', animationDelay: '100ms' }}></div>
      <div className="w-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full animate-wave" style={{ height: '16px', animationDelay: '200ms' }}></div>
      <div className="w-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full animate-wave" style={{ height: '12px', animationDelay: '300ms' }}></div>
      <div className="w-1 bg-gradient-to-t from-blue-400 to-blue-600 rounded-full animate-wave" style={{ height: '8px', animationDelay: '400ms' }}></div>
    </div>
  );

  const renderIndicator = () => {
    switch (variant) {
      case 'pulse':
        return renderPulseVariant();
      case 'wave':
        return renderWaveVariant();
      default:
        return renderDotsVariant();
    }
  };

  return (
    <div className={`flex items-start space-x-3 p-4 ${className}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* Typing Content */}
      <div className="flex-1 min-w-0">
        <div className="message-bubble assistant">
          <div className="flex items-center space-x-3">
            {renderIndicator()}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {userName} is typing{dots}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Enhanced version with streaming text effect
interface StreamingTypingIndicatorProps extends TypingIndicatorProps {
  streamingText?: string;
  showCursor?: boolean;
}

export const StreamingTypingIndicator: React.FC<StreamingTypingIndicatorProps> = ({
  isVisible = false,
  streamingText = '',
  showCursor = true,
  className = ''
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!isVisible || !streamingText) {
      setDisplayedText('');
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < streamingText.length) {
        setDisplayedText(streamingText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 30); // Typing speed

    return () => clearInterval(interval);
  }, [streamingText, isVisible]);

  useEffect(() => {
    if (!showCursor) return;

    const cursorInterval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 500);

    return () => clearInterval(cursorInterval);
  }, [showCursor]);

  if (!isVisible) return null;

  return (
    <div className={`flex items-start space-x-3 p-4 ${className}`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>

      {/* Streaming Content */}
      <div className="flex-1 min-w-0">
        <div className="message-bubble assistant">
          {streamingText ? (
            <div className="relative">
              <span className="whitespace-pre-wrap">{displayedText}</span>
              {showCursor && cursorVisible && (
                <span className="inline-block w-0.5 h-5 bg-blue-500 ml-1 animate-pulse"></span>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                Thinking...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
