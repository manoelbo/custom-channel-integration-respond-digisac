/**
 * Refera API Service
 * Serviço para integração com a API da Refera
 */

const axios = require('axios');
const https = require('https');
const { apiLog, errorLog } = require('../utils/logger');

/**
 * Cliente da API da Refera
 */
class ReferaApiService {
  constructor() {
    this.baseURL = 'https://api.refera.com.br/api/v1';
    this.username = process.env.REFERA_USERNAME;
    this.password = process.env.REFERA_PASSWORD;
    this.apiKey = process.env.REFERA_API_KEY;

    // Tokens de autenticação (serão obtidos dinamicamente)
    this.accessToken = null;
    this.csrfToken = null;
    this.tokenExpiry = null;

    // Controle de rate limiting para evitar bloqueios
    this.lastLoginAttempt = null;
    this.lastLoginError = null;
    this.cooldownMinutes = 60; // 60 minutos de cooldown após falha

    // Headers base (serão atualizados após login)
    this.headers = {
      'Content-Type': 'application/json',
    };

    // Adicionar API key aos headers base se disponível
    if (this.apiKey) {
      this.headers['api-key'] = this.apiKey;
    }

    // Criar instância axios com timeout e keep-alive
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: parseInt(process.env.HTTP_TIMEOUT_MS || '8000', 10),
      httpsAgent: new https.Agent({
        keepAlive: true,
        maxSockets: 50,
        timeout: 60000,
      }),
    });
  }

  /**
   * Verificar se as credenciais estão configuradas
   * @returns {boolean} - Se as credenciais estão configuradas
   */
  isConfigured() {
    return !!(this.username && this.password && this.apiKey);
  }

  /**
   * Verificar se está em cooldown após falha de login
   * @returns {Object} - Status do cooldown
   */
  isInCooldown() {
    if (!this.lastLoginAttempt) {
      return { inCooldown: false };
    }

    const now = new Date();
    const cooldownEnd = new Date(
      this.lastLoginAttempt.getTime() + this.cooldownMinutes * 60 * 1000
    );
    const timeRemaining = cooldownEnd.getTime() - now.getTime();

    if (timeRemaining > 0) {
      const minutesRemaining = Math.ceil(timeRemaining / (60 * 1000));
      return {
        inCooldown: true,
        minutesRemaining,
        cooldownEnd: cooldownEnd.toISOString(),
        lastError: this.lastLoginError,
      };
    }

    return { inCooldown: false };
  }

  /**
   * Registrar tentativa de login falhada
   * @param {Error} error - Erro da tentativa
   */
  recordLoginFailure(error) {
    this.lastLoginAttempt = new Date();
    this.lastLoginError = {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    };

    apiLog('🚫 Login falhou - Iniciando cooldown de 60 minutos');
    apiLog('❌ Erro da API da Refera:', error.message);
    if (error.response?.status) {
      apiLog('📋 Status HTTP:', error.response.status);
    }
    if (error.response?.data) {
      apiLog(
        '📦 Dados do erro:',
        process.env.LOG_LEVEL === 'debug'
          ? JSON.stringify(error.response.data, null, 2)
          : 'Dados do erro'
      );
    }
  }

  /**
   * Limpar histórico de falhas (quando login é bem-sucedido)
   */
  clearLoginFailure() {
    this.lastLoginAttempt = null;
    this.lastLoginError = null;
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
    // Verificar se está em cooldown
    const cooldownStatus = this.isInCooldown();
    if (cooldownStatus.inCooldown) {
      apiLog('⏰ Login bloqueado - Em cooldown após falha anterior');
      apiLog(`⏳ Tempo restante: ${cooldownStatus.minutesRemaining} minutos`);
      apiLog(
        `🕐 Próxima tentativa permitida em: ${cooldownStatus.cooldownEnd}`
      );
      if (cooldownStatus.lastError) {
        apiLog('❌ Último erro:', cooldownStatus.lastError.message);
        if (cooldownStatus.lastError.status) {
          apiLog('📋 Status HTTP:', cooldownStatus.lastError.status);
        }
        if (cooldownStatus.lastError.data) {
          apiLog(
            '📦 Dados do erro:',
            JSON.stringify(cooldownStatus.lastError.data, null, 2)
          );
        }
      }
      return false;
    }

    try {
      apiLog('🔐 Fazendo login na API da Refera...');

      const response = await this.http.post(
        '/login/',
        {
          email: this.username,
          password: this.password,
        },
        {
          headers: {
            accept: 'application/json, text/plain, /',
            'accept-language':
              'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh-TW;q=0.5,zh;q=0.4',
            'api-key': this.apiKey,
            'content-type': 'application/json; charset=UTF-8',
            origin: 'https://admin.refera.com.br',
            priority: 'u=1, i',
            referer: 'https://admin.refera.com.br/',
            'sec-ch-ua':
              '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
          },
        }
      );

      if (response.data && response.data.access) {
        this.accessToken = response.data.access;
        this.csrfToken = response.data.csrf_token || null;

        // Calcular expiração do token (assumindo 24 horas se não especificado)
        const expiresIn = response.data.expires_in || 86400; // 24 horas em segundos
        this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);

        // Atualizar headers com o novo token e manter a API key
        this.headers = {
          accept: 'application/json, text/plain, /',
          'accept-language':
            'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh-TW;q=0.5,zh;q=0.4',
          'api-key': this.apiKey,
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
          origin: 'https://admin.refera.com.br',
          priority: 'u=1, i',
          referer: 'https://admin.refera.com.br/',
          'sec-ch-ua':
            '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        };

        // Adicionar CSRF token se disponível
        if (this.csrfToken) {
          this.headers['Cookie'] = `csrftoken=${this.csrfToken}`;
        }

        // Limpar histórico de falhas após login bem-sucedido
        this.clearLoginFailure();

        apiLog('✅ Login na API da Refera realizado com sucesso');
        apiLog('📅 Token expira em:', this.tokenExpiry.toISOString());

        return true;
      } else {
        throw new Error('Resposta de login inválida');
      }
    } catch (error) {
      // Registrar falha e iniciar cooldown
      this.recordLoginFailure(error);
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

      const response = await this.http.get('/connections-message-tool/', {
        headers: this.headers,
        params: {
          channelID: channelID,
          ...data,
        },
      });

      apiLog('✅ Requisição para API da Refera bem-sucedida');
      apiLog('📋 Status da resposta:', response.status);

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
    const cooldownStatus = this.isInCooldown();

    return {
      isConfigured: this.isConfigured(),
      hasUsername: !!this.username,
      hasPassword: !!this.password,
      hasApiKey: !!this.apiKey,
      hasValidToken: this.isTokenValid(),
      tokenExpiry: this.tokenExpiry?.toISOString(),
      baseURL: this.baseURL,
      cooldown: {
        inCooldown: cooldownStatus.inCooldown,
        minutesRemaining: cooldownStatus.minutesRemaining || 0,
        cooldownEnd: cooldownStatus.cooldownEnd,
        lastError: cooldownStatus.lastError,
      },
    };
  }
}

// Instância singleton do serviço da Refera
const referaApiService = new ReferaApiService();

module.exports = {
  ReferaApiService,
  referaApiService,
};
