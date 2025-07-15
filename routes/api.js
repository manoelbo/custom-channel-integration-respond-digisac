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

/**
 * Classe para representar uma mensagem do DigiSac
 */
class DigiSacMessage {
  constructor() {
    this.to = ''; // Número do destinatário
    this.type = 'text'; // Tipo da mensagem (text, image, document, etc.)
    this.text = ''; // Texto da mensagem
    this.media = null; // Mídia (opcional)
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
      const payload = {
        to: message.to,
        type: message.type,
        text: {
          body: message.text,
        },
      };

      console.log('📤 Enviando mensagem DigiSac:', payload);

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
      const response = await axios.get(
        `${this.baseURL}/contacts/${phoneNumber}`,
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
        '❌ Erro ao obter perfil:',
        error.response?.data || error.message
      );

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
