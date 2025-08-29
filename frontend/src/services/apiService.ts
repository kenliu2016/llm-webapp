import axios from 'axios';

// 创建axios实例，设置基础URL
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' 
    ? 'https://www.chipfoundryservices.com/api' 
    : 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加认证token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误和刷新token
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // 可以在这里处理401错误，刷新token等
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 聊天相关API
export const chatAPI = {
  // 创建新对话
  createConversation: async (data: {
    title?: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    preset?: string;
  }) => {
    const response = await api.post('/conversations', data);
    return response.data;
  },

  // 获取对话列表
  getConversations: async () => {
    const response = await api.get('/conversations');
    return response.data;
  },

  // 获取单个对话详情
  getConversation: async (conversationId: string) => {
    const response = await api.get(`/conversations/${conversationId}`);
    return response.data;
  },

  // 发送消息
  sendMessage: async (
    conversationId: string,
    data: {
      content: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      attachments?: string[];
    }
  ) => {
    const response = await api.post(`/conversations/${conversationId}/messages`, data);
    return response.data;
  },

  // 上传图片
  uploadImage: async (conversationId: string, file: File) => {
    const formData = new FormData();
    formData.append('images', file);
    
    const response = await api.post(
      `/conversations/${conversationId}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    
    return response.data;
  },
};

// 健康检查API
export const healthAPI = {
  checkHealth: async () => {
    const response = await api.get('/health');
    return response.data;
  },
};

export default api;