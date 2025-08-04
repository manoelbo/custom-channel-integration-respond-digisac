/**
 * Refera API Service
 * Serviço para integração com a API da Refera
 */

const axios = require('axios');
const { apiLog, errorLog } = require('../utils/logger');

/**
 * Cliente da API da Refera
 */
class ReferaApiService {
  constructor() {
    this.baseURL = 'https://api.refera.com.br/api/v1';
    this.username = process.env.REFERA_USERNAME;
    this.password = process.env.REFERA_PASSWORD;

    // Tokens de autenticação (serão obtidos dinamicamente)
    this.accessToken = null;
    this.csrfToken = null;
    this.tokenExpiry = null;

    // Headers base (serão atualizados após login)
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Verificar se as credenciais estão configuradas
   * @returns {boolean} - Se as credenciais estão configuradas
   */
  isConfigured() {
    return !!(this.username && this.password);
  }

  /**
   * Verificar se o token está válido
   * @returns {boolean} - Se o token está válido
   */
  isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }

    // Verificar se o token não expirou (com margem de 5 minutos)
    const now = new Date();
    const expiryTime = new Date(this.tokenExpiry);
    const marginTime = new Date(expiryTime.getTime() - 5 * 60 * 1000); // 5 minutos antes

    return now < marginTime;
  }

  /**
   * Fazer login na API da Refera
   * @returns {Promise<boolean>} - Se o login foi bem-sucedido
   */
  async login() {
    try {
      apiLog('🔐 Fazendo login na API da Refera...');

      const response = await axios({
        method: 'post',
        url: `${this.baseURL}/login`,
        headers: {
          'Content-Type': 'application/json',
        },
        data: {
          username: this.username,
          password: this.password,
        },
      });

      if (response.data && response.data.access) {
        this.accessToken = response.data.access;
        this.csrfToken = response.data.csrf_token || null;

        // Calcular expiração do token (assumindo 24 horas se não especificado)
        const expiresIn = response.data.expires_in || 86400; // 24 horas em segundos
        this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

        // Atualizar headers com o novo token
        this.headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        };

        // Adicionar CSRF token se disponível
        if (this.csrfToken) {
          this.headers['Cookie'] = `csrftoken=${this.csrfToken}`;
        }

        apiLog('✅ Login na API da Refera realizado com sucesso');
        apiLog('📅 Token expira em:', this.tokenExpiry.toISOString());

        return true;
      } else {
        throw new Error('Resposta de login inválida');
      }
    } catch (error) {
      errorLog('❌ Erro no login da API da Refera:', error.message);
      apiLog('📋 Status do erro:', error.response?.status);
      apiLog('📦 Dados do erro:', error.response?.data);

      return false;
    }
  }

  /**
   * Garantir que temos um token válido (fazer login se necessário)
   * @returns {Promise<boolean>} - Se temos um token válido
   */
  async ensureValidToken() {
    if (!this.isTokenValid()) {
      apiLog('🔄 Token expirado ou inválido, fazendo novo login...');
      return await this.login();
    }

    return true;
  }

  /**
   * Fazer chamada para a API da Refera com retry automático em caso de token inválido
   * @param {string} channelID - ID do canal
   * @param {Object} data - Dados adicionais
   * @returns {Promise<Object>} - Resposta da API
   */
  async callMessageTool(channelID, data = {}) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Credenciais da API da Refera não estão configuradas');
      }

      // Garantir que temos um token válido
      const hasValidToken = await this.ensureValidToken();
      if (!hasValidToken) {
        throw new Error(
          'Não foi possível obter um token válido da API da Refera'
        );
      }

      apiLog('🔔 Fazendo chamada para API da Refera:', {
        channelID,
        hasData: !!Object.keys(data).length,
      });

      const response = await axios({
        method: 'get',
        url: `${this.baseURL}/connections-message-tool/`,
        headers: this.headers,
        params: {
          channelID: channelID,
          ...data,
        },
      });

      apiLog('✅ Requisição para API da Refera bem-sucedida');
      apiLog('📋 Status da resposta:', response.status);
      apiLog('📦 Dados estruturados:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      // Verificar se é erro de token inválido
      if (
        error.response?.data?.code === 'token_not_valid' ||
        error.response?.data?.detail?.includes('token not valid')
      ) {
        apiLog('🔄 Token inválido detectado, tentando novo login...');

        // Tentar fazer login novamente
        const loginSuccess = await this.login();
        if (loginSuccess) {
          // Tentar a chamada novamente
          return await this.callMessageTool(channelID, data);
        }
      }

      errorLog('❌ Erro na requisição para API da Refera:', error.message);
      apiLog('📋 Status do erro:', error.response?.status);
      apiLog('📦 Dados do erro:', error.response?.data);

      return {
        success: false,
        error: {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        },
      };
    }
  }

  /**
   * Processar mensagem através da API da Refera
   * @param {string} channelID - ID do canal
   * @param {Object} messageData - Dados da mensagem
   * @returns {Promise<Object>} - Resultado do processamento
   */
  async processMessage(channelID, messageData) {
    try {
      const result = await this.callMessageTool(channelID, messageData);

      if (result.success) {
        return {
          status: 'success',
          message: 'Requisição para API da Refera realizada com sucesso',
          channelID: channelID,
          referaResponse: {
            status: result.status,
            data: result.data,
          },
        };
      } else {
        return {
          status: 'error',
          message: 'Erro na requisição para API da Refera',
          channelID: channelID,
          error: result.error,
        };
      }
    } catch (error) {
      errorLog('❌ Erro ao processar mensagem na Refera:', error);
      return {
        status: 'error',
        message: 'Erro interno ao processar mensagem',
        channelID: channelID,
        error: {
          message: error.message,
        },
      };
    }
  }

  /**
   * Obter informações de configuração da API
   * @returns {Object} - Informações de configuração
   */
  getConfigInfo() {
    return {
      isConfigured: this.isConfigured(),
      hasUsername: !!this.username,
      hasPassword: !!this.password,
      hasValidToken: this.isTokenValid(),
      tokenExpiry: this.tokenExpiry?.toISOString(),
      baseURL: this.baseURL,
    };
  }
}

// Instância singleton do serviço da Refera
const referaApiService = new ReferaApiService();

module.exports = {
  ReferaApiService,
  referaApiService,
};
