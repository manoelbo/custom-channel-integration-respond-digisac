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
    this.apiKey = process.env.REFERA_API_KEY;
    this.apiToken = process.env.REFERA_API_TOKEN;
    this.csrfToken = process.env.REFERA_CSRF_TOKEN;

    this.headers = {
      'API-Key': this.apiKey,
      Authorization: `Bearer ${this.apiToken}`,
      Cookie: `csrftoken=${this.csrfToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Verificar se as credenciais estão configuradas
   * @returns {boolean} - Se as credenciais estão configuradas
   */
  isConfigured() {
    return !!(this.apiKey && this.apiToken && this.csrfToken);
  }

  /**
   * Fazer chamada para a API da Refera
   * @param {string} channelID - ID do canal
   * @param {Object} data - Dados adicionais
   * @returns {Promise<Object>} - Resposta da API
   */
  async callMessageTool(channelID, data = {}) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Credenciais da API da Refera não estão configuradas');
      }

      apiLog('🔔 Fazendo chamada para API da Refera:', {
        channelID,
        hasData: !!Object.keys(data).length,
      });

      const response = await axios({
        method: 'get',
        url: `${this.baseURL}/connections-message-tool/`,
        headers: this.headers,
        data: {
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
      hasApiKey: !!this.apiKey,
      hasApiToken: !!this.apiToken,
      hasCsrfToken: !!this.csrfToken,
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
