/**
 * Respond.io API Service
 * Serviço para integração com a API do Respond.io Custom Channel
 * Documentação: https://docs.respond.io/messaging-channels/custom-channel
 */

const axios = require('axios');
const https = require('https');
const { conditionalLog, errorLog } = require('../utils/logger');
const {
  formatContactForRespondIo,
  formatMessageForRespondIo,
} = require('../utils/formatters');

/**
 * Respond.io custom channel API Token
 * Obtenha seu token em: https://docs.respond.io/messaging-channels/custom-channel
 */
const CHANNEL_API_TOKEN = process.env.RESPOND_IO_TOKEN || '<API Token>';

/**
 * Cliente da API Respond.io
 */
class RespondIoApiService {
  constructor() {
    this.baseURL = 'https://app.respond.io/custom/channel/webhook/';
    this.token = CHANNEL_API_TOKEN;
    this.channelId = process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001';

    this.headers = {
      authorization: `Bearer ${this.token}`,
      'content-type': 'application/json',
      'cache-control': 'no-cache',
    };

    // Criar instância axios com timeout e keep-alive
    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: parseInt(process.env.HTTP_TIMEOUT_MS || '8000', 10),
      httpsAgent: new https.Agent({ 
        keepAlive: true, 
        maxSockets: 50,
        timeout: 60000 
      }),
      headers: this.headers,
    });
  }

  /**
   * Verificar se o token está configurado
   * @returns {boolean} - Se o token está configurado
   */
  isConfigured() {
    return this.token !== '<API Token>' && !!this.token;
  }

  /**
   * Enviar mensagem para o Respond.io
   * @param {Object} messageData - Dados da mensagem
   * @param {string} messageId - ID da mensagem
   * @param {string} contactPhoneNumber - Número do contato
   * @param {number} timestamp - Timestamp da mensagem
   * @param {boolean} isFromMe - Se a mensagem é do agente
   * @param {Object} contactData - Dados do contato (opcional)
   * @returns {Promise<Object>} - Resposta da API
   */
  async sendMessage(
    messageData,
    messageId,
    contactPhoneNumber,
    timestamp,
    isFromMe = false,
    contactData = null
  ) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Token do Respond.io não está configurado');
      }

      const webhookData = formatMessageForRespondIo(
        messageData,
        messageId,
        contactPhoneNumber,
        timestamp,
        isFromMe
      );

      // Adicionar informações do contato se fornecidas
      if (contactData) {
        webhookData.contact = formatContactForRespondIo(
          contactData,
          contactPhoneNumber
        );
        conditionalLog(
          contactPhoneNumber,
          '👤 Dados do contato incluídos:',
          webhookData.contact
        );
      }

      conditionalLog(
        contactPhoneNumber,
        `📤 Enviando para respond.io (${
          isFromMe ? 'MESSAGING ECHO' : 'MESSAGE'
        }):`,
        webhookData
      );

      const response = await this.http.post('', webhookData);

      conditionalLog(
        contactPhoneNumber,
        `✅ ${
          isFromMe ? 'Messaging Echo' : 'Mensagem'
        } enviada para respond.io:`,
        response.status
      );

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      errorLog('❌ Erro ao enviar mensagem para Respond.io:', error.message);

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
   * Enviar mensagem com dados de contato (para Messaging Echoes)
   * @param {Object} messageData - Dados da mensagem
   * @param {string} messageId - ID da mensagem
   * @param {string} contactPhoneNumber - Número do contato
   * @param {number} timestamp - Timestamp da mensagem
   * @param {Object} contactData - Dados do contato
   * @returns {Promise<Object>} - Resposta da API
   */
  async sendMessageWithContact(
    messageData,
    messageId,
    contactPhoneNumber,
    timestamp,
    contactData
  ) {
    try {
      if (!this.isConfigured()) {
        throw new Error('Token do Respond.io não está configurado');
      }

      const webhookData = formatMessageForRespondIo(
        messageData,
        messageId,
        contactPhoneNumber,
        timestamp,
        true // isFromMe = true para Messaging Echo
      );

      // Adicionar informações do contato
      webhookData.contact = formatContactForRespondIo(
        contactData,
        contactPhoneNumber
      );

      conditionalLog(
        contactPhoneNumber,
        '👤 Dados do contato adicionados para Messaging Echo:',
        webhookData.contact
      );

      conditionalLog(
        contactPhoneNumber,
        '📤 Enviando Messaging Echo para respond.io:',
        webhookData
      );

      const response = await this.http.post('', webhookData);

      conditionalLog(
        contactPhoneNumber,
        '✅ Messaging Echo enviado para respond.io:',
        response.status
      );

      return {
        success: true,
        status: response.status,
        data: response.data,
      };
    } catch (error) {
      errorLog(
        '❌ Erro ao enviar Messaging Echo para Respond.io:',
        error.message
      );

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
   * Validar autenticação de uma requisição
   * @param {Object} req - Request object
   * @param {string} phoneNumber - Número de telefone para logs
   * @returns {Object} - { success: boolean, error?: Object }
   */
  validateAuthentication(req, phoneNumber) {
    const bearerToken = req.headers.authorization;
    conditionalLog(phoneNumber, '🔑 Bearer token recebido:', bearerToken);
    conditionalLog(
      phoneNumber,
      '🔑 CHANNEL_API_TOKEN configurado:',
      this.token
    );

    if (!bearerToken) {
      return {
        success: false,
        error: {
          status: 401,
          message: '401: UNAUTHORIZED - Bearer token não encontrado',
        },
      };
    }

    const token = bearerToken.substring(7, bearerToken.length);
    conditionalLog(phoneNumber, '🔑 Token extraído:', token);
    conditionalLog(phoneNumber, '🔑 Token esperado:', this.token);
    conditionalLog(phoneNumber, '🔑 Tokens são iguais?', token === this.token);

    if (token !== this.token) {
      return {
        success: false,
        error: {
          status: 401,
          message: '401: UNAUTHORIZED - Token inválido',
        },
      };
    }

    conditionalLog(phoneNumber, '✅ Autenticação bem-sucedida');
    return { success: true };
  }

  /**
   * Obter informações de configuração da API
   * @returns {Object} - Informações de configuração
   */
  getConfigInfo() {
    return {
      isConfigured: this.isConfigured(),
      hasToken: !!this.token,
      channelId: this.channelId,
      baseURL: this.baseURL,
    };
  }

  /**
   * Processar dados de mensagem recebida do DigiSac
   * @param {Object} messageData - Dados da mensagem do DigiSac
   * @param {string} messageType - Tipo da mensagem
   * @param {string} phoneNumber - Número de telefone
   * @returns {Object} - Dados processados para Respond.io
   */
  processDigiSacMessage(messageData, messageType, phoneNumber) {
    let messageBody = '';
    let processedMessage = null;

    // Ignorar mensagens do tipo "ticket"
    if (messageType === 'ticket') {
      conditionalLog(
        phoneNumber,
        '🚫 Mensagem do tipo "ticket" ignorada no processamento'
      );
      return {
        messageBody: '',
        processedMessage: null,
        ignored: true,
        reason: 'ticket_message_type',
      };
    }

    // Para mensagens do tipo 'chat', o texto está diretamente no campo 'text'
    if (messageType === 'chat' || messageType === 'text') {
      messageBody =
        messageData.text ||
        messageData.body ||
        messageData.message ||
        messageData.content ||
        '';

      processedMessage = {
        type: 'text',
        text: messageBody,
      };
    } else {
      // Para tipos de mídia, sempre tentar processar como attachment
      if (
        ['image', 'audio', 'ptt', 'document', 'video'].includes(messageType)
      ) {
        conditionalLog(phoneNumber, '📎 Processando mídia do DigiSac');

        // Importar o serviço do DigiSac para processar arquivos
        const { digiSacApiService } = require('./digisac');
        processedMessage = digiSacApiService.processDigiSacFile(
          messageData,
          phoneNumber
        );

        if (processedMessage) {
          messageBody = `📎 ${processedMessage.attachment.fileName}`;
        } else {
          // Fallback se não conseguir processar
          switch (messageType) {
            case 'document':
              messageBody = `📄 Documento: arquivo`;
              break;
            case 'ptt':
            case 'audio':
              messageBody = '🎵 Mensagem de áudio';
              break;
            case 'image':
              messageBody = '🖼️ Imagem';
              break;
            case 'video':
              messageBody =
                '🎥 Vídeo: abrir no digisac ou no whatsapp para ver o vídeo';
              break;
            default:
              messageBody = `📎 Mídia (${messageType})`;
          }

          processedMessage = {
            type: 'text',
            text: messageBody,
          };
        }
      } else {
        // Para outros tipos (location, contact, sticker), usar texto
        switch (messageType) {
          case 'location':
            messageBody = '📍 Localização';
            break;
          case 'contact':
            messageBody = '👤 Contato';
            break;
          case 'sticker':
            messageBody = '😀 Sticker';
            break;
          default:
            messageBody = `📎 Mídia (${messageType})`;
        }

        processedMessage = {
          type: 'text',
          text: messageBody,
        };
      }
    }

    conditionalLog(phoneNumber, '🔍 Message Body extraído:', messageBody);
    conditionalLog(phoneNumber, '🔍 Mensagem processada:', processedMessage);

    return {
      messageBody,
      processedMessage,
    };
  }
}

// Instância singleton da API Respond.io
const respondIoApiService = new RespondIoApiService();

module.exports = {
  RespondIoApiService,
  respondIoApiService,
  CHANNEL_API_TOKEN,
};
