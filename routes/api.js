// routes/api.js
/**
 * DigiSac API Integration
 * API brasileira de mensageria WhatsApp
 * Documentação: https://documenter.getpostman.com/view/24605757/2sA3BhfaDg
 */

const axios = require('axios');

// Configurações da API DigiSac
const DIGISAC_API_BASE_URL =
  process.env.DIGISAC_API_URL || 'https://api.sac.digital/v1';
const DIGISAC_API_TOKEN = process.env.DIGISAC_API_TOKEN || 'YOUR_DIGISAC_TOKEN';

// Configurações de sandbox
const SANDBOX_MODE = process.env.SANDBOX_MODE === 'true';
const SANDBOX_NUMBERS = (process.env.SANDBOX_NUMBERS || '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean);

/**
 * Função helper para logs condicionais
 * Só mostra logs detalhados quando estiver no modo sandbox e para números autorizados
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function conditionalLog(phoneNumber, message, data = null) {
  // Sempre mostrar logs de erro
  if (message.includes('❌') || message.includes('⚠️')) {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
    return;
  }

  // Se não estiver no modo sandbox, só mostrar logs essenciais
  if (!SANDBOX_MODE) {
    if (
      message.includes('🚀') ||
      message.includes('✅') ||
      message.includes('📤')
    ) {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
    return;
  }

  // Se estiver no modo sandbox, verificar se o número está autorizado
  if (SANDBOX_NUMBERS.includes(phoneNumber)) {
    if (data) {
      console.log(`[SANDBOX] ${message}`, data);
    } else {
      console.log(`[SANDBOX] ${message}`);
    }
  }
}

/**
 * Função helper para logs sempre visíveis (erros, health check, etc.)
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function alwaysLog(message, data = null) {
  if (data) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}

/**
 * Classe para representar uma mensagem do DigiSac
 */
class DigiSacMessage {
  constructor() {
    this.to = ''; // Número do destinatário
    this.type = 'text'; // Tipo da mensagem (text, image, document, audio)
    this.text = ''; // Texto da mensagem (opcional para áudio)
    this.file = null; // Arquivo (base64, mimetype, name)
    this.service_id = '6e9aab4c-94fd-47e0-99f2-06ae04caaa0c';
    this.user_id = 'c3c4de37-afc8-4be0-96a8-4f1f606eeea3';
  }
}

/**
 * Classe para coleção de mensagens DigiSac
 */
class DigiSacMessageCollection {
  constructor() {
    this.messages = [];
  }
}

/**
 * Cliente da API DigiSac
 */
class DigiSacApi {
  constructor() {
    this.baseURL = DIGISAC_API_BASE_URL;
    this.token = DIGISAC_API_TOKEN;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/json',
    };
  }

  /**
   * Enviar mensagem via DigiSac
   * @param {DigiSacMessage} message - Mensagem a ser enviada
   * @returns {Promise}
   */
  async sendMessage(message) {
    try {
      // Construir payload baseado no tipo de mensagem
      let payload = {
        number: message.to, // Número do contato
        serviceId: message.service_id, // ID da conexão
      };

      // Adicionar texto se existir (exceto para áudio puro)
      if (message.text && message.text.trim() !== '') {
        payload.text = message.text;
      }

      // Adicionar arquivo se existir
      if (message.file) {
        payload.file = message.file;
      }

      conditionalLog(message.to, '📤 Enviando mensagem DigiSac:', payload);

      const response = await axios.post(`${this.baseURL}/messages`, payload, {
        headers: this.headers,
      });

      return {
        success: true,
        data: {
          message_id: response.data.id || `digisac_${Date.now()}`,
          status: response.data.status || 'sent',
          to: message.to,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(
        '❌ Erro ao enviar mensagem DigiSac:',
        error.response?.data || error.message
      );

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao enviar mensagem',
          details: error.response?.data || error.message,
        },
      };
    }
  }

  /**
   * Processar mensagem em lote
   * @param {DigiSacMessageCollection} messageCollection - Coleção de mensagens
   * @returns {Promise}
   */
  async sendBulkMessages(messageCollection) {
    const results = [];

    for (const message of messageCollection.messages) {
      const result = await this.sendMessage(message);
      results.push(result);
    }

    return results;
  }

  /**
   * Verificar status de uma mensagem
   * @param {string} messageId - ID da mensagem
   * @returns {Promise}
   */
  async getMessageStatus(messageId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/messages/${messageId}`,
        {
          headers: this.headers,
        }
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error(
        '❌ Erro ao verificar status:',
        error.response?.data || error.message
      );

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao verificar status',
        },
      };
    }
  }

  /**
   * Obter perfil de um contato
   * @param {string} phoneNumber - Número do telefone
   * @returns {Promise}
   */
  async getContactProfile(phoneNumber) {
    try {
      conditionalLog(
        phoneNumber,
        '🔍 DigiSac API - Buscando contato:',
        phoneNumber
      );
      conditionalLog(
        phoneNumber,
        '🔍 DigiSac API - URL:',
        `${this.baseURL}/contacts/${phoneNumber}`
      );
      conditionalLog(phoneNumber, '🔍 DigiSac API - Headers:', this.headers);

      const response = await axios.get(
        `${this.baseURL}/contacts/${phoneNumber}`,
        {
          headers: this.headers,
        }
      );

      conditionalLog(phoneNumber, '✅ DigiSac API - Resposta completa:');
      conditionalLog(phoneNumber, '📋 Status:', response.status);
      conditionalLog(
        phoneNumber,
        '📋 Headers:',
        JSON.stringify(response.headers, null, 2)
      );
      conditionalLog(
        phoneNumber,
        '📦 Body:',
        JSON.stringify(response.data, null, 2)
      );

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error('❌ DigiSac API - Erro ao obter perfil:');
      console.error('📋 Status:', error.response?.status);
      console.error(
        '📋 Headers:',
        JSON.stringify(error.response?.headers, null, 2)
      );
      console.error('📦 Body:', JSON.stringify(error.response?.data, null, 2));
      console.error('📦 Error:', error.message);

      return {
        success: false,
        error: {
          code: error.response?.status || 500,
          message: error.response?.data?.message || 'Erro ao obter perfil',
        },
      };
    }
  }
}

// Instância singleton da API DigiSac
const digiSacApi = new DigiSacApi();

/**
 * Função utilitária para formatar número de telefone brasileiro
 * @param {string} phoneNumber - Número do telefone
 * @returns {string} - Número formatado
 */
function formatBrazilianPhoneNumber(phoneNumber) {
  // Remove todos os caracteres não numéricos
  let cleaned = phoneNumber.replace(/\D/g, '');

  // Se não começar com 55 (código do Brasil), adiciona
  if (!cleaned.startsWith('55')) {
    cleaned = '55' + cleaned;
  }

  // Formato: 5511999999999 (código país + DDD + número)
  return cleaned;
}

/**
 * Função utilitária para validar número de telefone brasileiro
 * @param {string} phoneNumber - Número do telefone
 * @returns {boolean} - Se é válido
 */
function isValidBrazilianPhone(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Deve ter entre 12-13 dígitos (55 + DDD + número)
  return (
    cleaned.length >= 12 && cleaned.length <= 13 && cleaned.startsWith('55')
  );
}

module.exports = {
  DigiSacMessage,
  DigiSacMessageCollection,
  DigiSacApi,
  digiSacApi,
  formatBrazilianPhoneNumber,
  isValidBrazilianPhone,
};
