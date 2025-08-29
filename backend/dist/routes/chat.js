import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { authenticate, getUserTierLimits } from '../middleware/auth.js';
import { query } from '../database/connection.js';
import { cacheService, rateLimitService } from '../services/redis.js';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console()
    ]
});
const router = Router();
// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(process.cwd(), 'uploads', 'images');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        }
        catch (error) {
            cb(error, uploadDir);
        }
    },
    filename: (req, file, cb) => {
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueId}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
        }
    }
});
// Create new conversation with enhanced features
const createConversationValidation = [
    body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
    body('systemPrompt').optional().trim().isLength({ max: 2000 }).withMessage('System prompt too long'),
    body('model').optional().isString().withMessage('Invalid model'),
    body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('Temperature must be between 0 and 2'),
    body('maxTokens').optional().isInt({ min: 1, max: 4096 }).withMessage('Max tokens must be between 1 and 4096'),
    body('preset').optional().isString().withMessage('Invalid preset')
];
router.post('/conversations', authenticate, createConversationValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const user = req.user;
        const { title = 'New Conversation', systemPrompt, model = 'gpt-3.5-turbo', temperature = 0.7, maxTokens = 2048, preset } = req.body;
        // Check rate limits
        const tierLimits = getUserTierLimits(user.role);
        const rateLimitKey = `conversations:${user.id}`;
        const isAllowed = await rateLimitService.checkRateLimit(rateLimitKey, tierLimits.requestsPerHour, 3600);
        if (!isAllowed) {
            return res.status(429).json({
                success: false,
                message: 'Rate limit exceeded. Please try again later.'
            });
        }
        const conversationId = uuidv4();
        const settings = {
            model,
            temperature,
            maxTokens,
            systemPrompt: systemPrompt || null
        };
        await query(`INSERT INTO conversations (id, user_id, title, settings, preset)
       VALUES ($1, $2, $3, $4, $5)`, [conversationId, user.id, title, JSON.stringify(settings), preset]);
        // Add system message if provided
        if (systemPrompt) {
            await query(`INSERT INTO messages (id, conversation_id, role, content, token_count)
         VALUES ($1, $2, $3, $4, $5)`, [uuidv4(), conversationId, 'system', systemPrompt, 0]);
        }
        logger.info('Conversation created', { userId: user.id, conversationId, model });
        res.status(201).json({
            success: true,
            conversation: {
                id: conversationId,
                title,
                settings,
                preset,
                createdAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        logger.error('Create conversation error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to create conversation'
        });
    }
});
// Upload images for multi-modal conversations
router.post('/conversations/:conversationId/upload', authenticate, upload.array('images', 5), async (req, res) => {
    try {
        const user = req.user;
        const { conversationId } = req.params;
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }
        // Verify conversation ownership
        const conversation = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
        if (conversation.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        const uploadedFiles = [];
        for (const file of files) {
            try {
                // Process and optimize image
                const optimizedPath = path.join(path.dirname(file.path), `optimized_${path.basename(file.path, path.extname(file.path))}.webp`);
                await sharp(file.path)
                    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(optimizedPath);
                // Get image info
                const imageInfo = await sharp(file.path).metadata();
                // Save to database
                const fileId = uuidv4();
                await query(`INSERT INTO file_uploads (id, conversation_id, user_id, filename, original_name, file_path, optimized_path, file_size, mime_type, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                    fileId,
                    conversationId,
                    user.id,
                    path.basename(file.path),
                    file.originalname,
                    file.path,
                    optimizedPath,
                    file.size,
                    file.mimetype,
                    JSON.stringify({
                        width: imageInfo.width,
                        height: imageInfo.height,
                        format: imageInfo.format
                    })
                ]);
                uploadedFiles.push({
                    id: fileId,
                    filename: file.originalname,
                    size: file.size,
                    mimeType: file.mimetype,
                    url: `/api/uploads/${fileId}`,
                    metadata: {
                        width: imageInfo.width,
                        height: imageInfo.height,
                        format: imageInfo.format
                    }
                });
                // Clean up original file
                await fs.unlink(file.path);
            }
            catch (fileError) {
                logger.error('File processing error', { error: fileError.message, filename: file.originalname });
            }
        }
        logger.info('Files uploaded', { userId: user.id, conversationId, fileCount: uploadedFiles.length });
        res.json({
            success: true,
            message: 'Files uploaded successfully',
            files: uploadedFiles
        });
    }
    catch (error) {
        logger.error('Upload error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to upload files'
        });
    }
});
// Send message with enhanced features
const sendMessageValidation = [
    body('content').trim().notEmpty().withMessage('Message content is required'),
    body('model').optional().isString().withMessage('Invalid model'),
    body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('Invalid temperature'),
    body('maxTokens').optional().isInt({ min: 1, max: 4096 }).withMessage('Invalid max tokens'),
    body('attachments').optional().isArray().withMessage('Attachments must be an array')
];
router.post('/conversations/:conversationId/messages', authenticate, sendMessageValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        const user = req.user;
        const { conversationId } = req.params;
        const { content, model, temperature, maxTokens, attachments = [] } = req.body;
        // Check rate limits
        const tierLimits = getUserTierLimits(user.role);
        const rateLimitKey = `messages:${user.id}`;
        const isAllowed = await rateLimitService.checkRateLimit(rateLimitKey, tierLimits.requestsPerHour, 3600);
        if (!isAllowed) {
            return res.status(429).json({
                success: false,
                message: 'Rate limit exceeded. Please try again later.'
            });
        }
        // Verify conversation ownership
        const conversation = await query('SELECT id, settings FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
        if (conversation.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        const conversationSettings = conversation.rows[0].settings || {};
        // Use conversation settings as defaults
        const finalModel = model || conversationSettings.model || 'gpt-3.5-turbo';
        const finalTemperature = temperature ?? conversationSettings.temperature ?? 0.7;
        const finalMaxTokens = maxTokens || conversationSettings.maxTokens || 2048;
        // Create cache key for response caching
        const cacheKey = `response:${Buffer.from(content + finalModel + finalTemperature + finalMaxTokens).toString('base64')}`;
        // Check cache first
        const cachedResponse = await cacheService.get(cacheKey);
        if (cachedResponse && process.env.ENABLE_RESPONSE_CACHE === 'true') {
            logger.info('Cache hit for message', { userId: user.id, conversationId });
            return res.json({
                success: true,
                message: cachedResponse,
                cached: true
            });
        }
        // Save user message
        const userMessageId = uuidv4();
        const messageData = {
            content,
            attachments: attachments.length > 0 ? attachments : null
        };
        await query(`INSERT INTO messages (id, conversation_id, role, content, token_count, model, attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userMessageId, conversationId, 'user', JSON.stringify(messageData), 0, finalModel, JSON.stringify(attachments)]);
        // Prepare message for AI API
        const messageHistory = await query(`SELECT role, content, attachments FROM messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC`, [conversationId]);
        // Format messages for AI API
        const formattedMessages = messageHistory.rows.map((msg) => {
            const msgContent = typeof msg.content === 'string' ?
                JSON.parse(msg.content) : msg.content;
            if (msg.role === 'user' && msg.attachments) {
                // Handle multi-modal messages
                return {
                    role: msg.role,
                    content: [
                        { type: 'text', text: msgContent.content || msgContent },
                        ...msg.attachments.map((att) => ({
                            type: 'image_url',
                            image_url: { url: `${process.env.BASE_URL}/api/uploads/${att.id}` }
                        }))
                    ]
                };
            }
            return {
                role: msg.role,
                content: msgContent.content || msgContent
            };
        });
        // Simulate AI response (replace with actual AI API call)
        const aiResponse = await simulateAIResponse(formattedMessages, {
            model: finalModel,
            temperature: finalTemperature,
            maxTokens: finalMaxTokens
        });
        // Save AI response
        const assistantMessageId = uuidv4();
        await query(`INSERT INTO messages (id, conversation_id, role, content, token_count, model)
         VALUES ($1, $2, $3, $4, $5, $6)`, [assistantMessageId, conversationId, 'assistant', aiResponse.content, aiResponse.tokenCount, finalModel]);
        // Update conversation
        await query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [conversationId]);
        // Cache the response
        if (process.env.ENABLE_RESPONSE_CACHE === 'true') {
            await cacheService.set(cacheKey, aiResponse, 3600); // Cache for 1 hour
        }
        logger.info('Message sent successfully', {
            userId: user.id,
            conversationId,
            model: finalModel,
            tokenCount: aiResponse.tokenCount
        });
        res.json({
            success: true,
            message: {
                id: assistantMessageId,
                role: 'assistant',
                content: aiResponse.content,
                tokenCount: aiResponse.tokenCount,
                model: finalModel,
                createdAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        logger.error('Send message error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
});
// Get conversation with enhanced message loading
router.get('/conversations/:conversationId', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        // Get conversation details
        const conversation = await query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
        if (conversation.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        // Get messages with pagination
        const messages = await query(`SELECT m.*, 
        CASE 
          WHEN m.attachments IS NOT NULL 
          THEN (
            SELECT json_agg(
              json_build_object(
                'id', f.id,
                'filename', f.original_name,
                'url', '/api/uploads/' || f.id,
                'mimeType', f.mime_type,
                'metadata', f.metadata
              )
            )
            FROM file_uploads f 
            WHERE f.id = ANY(
              SELECT json_array_elements_text(m.attachments::json)::uuid
            )
          )
          ELSE NULL
        END as attachment_details
       FROM messages m
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`, [conversationId, limitNum, offset]);
        // Get total message count
        const totalCount = await query('SELECT COUNT(*) FROM messages WHERE conversation_id = $1', [conversationId]);
        const conversationData = conversation.rows[0];
        const totalMessages = parseInt(totalCount.rows[0].count);
        res.json({
            success: true,
            conversation: {
                id: conversationData.id,
                title: conversationData.title,
                settings: conversationData.settings,
                preset: conversationData.preset,
                createdAt: conversationData.created_at,
                updatedAt: conversationData.updated_at
            },
            messages: messages.rows.reverse().map((msg) => ({
                id: msg.id,
                role: msg.role,
                content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
                tokenCount: msg.token_count,
                model: msg.model,
                attachments: msg.attachment_details,
                createdAt: msg.created_at
            })),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: totalMessages,
                pages: Math.ceil(totalMessages / limitNum),
                hasMore: offset + messages.rows.length < totalMessages
            }
        });
    }
    catch (error) {
        logger.error('Get conversation error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversation'
        });
    }
});
// Export conversation as markdown
router.get('/conversations/:conversationId/export', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { conversationId } = req.params;
        const { format = 'markdown' } = req.query;
        // Get conversation with all messages
        const conversation = await query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, user.id]);
        if (conversation.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }
        const messages = await query(`SELECT * FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`, [conversationId]);
        const conversationData = conversation.rows[0];
        if (format === 'markdown') {
            let markdown = `# ${conversationData.title}\n\n`;
            markdown += `**Created:** ${new Date(conversationData.created_at).toLocaleString()}\n`;
            markdown += `**Model:** ${conversationData.settings?.model || 'Unknown'}\n\n`;
            markdown += `---\n\n`;
            for (const msg of messages.rows) {
                const msgData = msg;
                const content = typeof msgData.content === 'string' ?
                    JSON.parse(msgData.content) : msgData.content;
                if (msgData.role === 'system')
                    continue;
                markdown += `## ${msgData.role === 'user' ? 'You' : 'Assistant'}\n\n`;
                markdown += `${content.content || content}\n\n`;
                if (msgData.token_count) {
                    markdown += `*Tokens: ${msgData.token_count}*\n\n`;
                }
                markdown += `---\n\n`;
            }
            res.setHeader('Content-Type', 'text/markdown');
            res.setHeader('Content-Disposition', `attachment; filename="${conversationData.title.replace(/[^a-zA-Z0-9]/g, '_')}.md"`);
            res.send(markdown);
        }
        else {
            res.status(400).json({
                success: false,
                message: 'Unsupported export format'
            });
        }
    }
    catch (error) {
        logger.error('Export conversation error', { error: error.message, userId: req.user?.id });
        res.status(500).json({
            success: false,
            message: 'Failed to export conversation'
        });
    }
});
// Simulate AI response (replace with actual AI API integration)
async function simulateAIResponse(messages, settings) {
    // This is a placeholder - replace with actual AI API calls
    const responses = [
        "I understand your question. Let me help you with that.",
        "That's an interesting point. Here's my perspective on it.",
        "I can provide you with some information about that topic.",
        "Let me think about this and give you a comprehensive answer.",
        "Based on what you've shared, I would suggest the following approach."
    ];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    const tokenCount = Math.floor(Math.random() * 100) + 50;
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    return {
        content: randomResponse,
        tokenCount
    };
}
export default router;
//# sourceMappingURL=chat.js.map