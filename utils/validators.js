/**
 * Validators utilities for the DigiSac ↔ Respond.io integration
 * Functions for data validation and format checking
 */

const { formatBrazilianPhoneNumber } = require('./formatters');

/**
 * Função utilitária para validar número de telefone brasileiro
 * @param {string} phoneNumber - Número do telefone
 * @returns {boolean} - Se é válido
 */
function isValidBrazilianPhone(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }

  const cleaned = phoneNumber.replace(/\D/g, '');

  // Deve ter entre 12-13 dígitos (55 + DDD + número)
  return (
    cleaned.length >= 12 && cleaned.length <= 13 && cleaned.startsWith('55')
  );
}

/**
 * Função para validar autenticação via Bearer token
 * @param {Object} req - Request object
 * @param {string} expectedToken - Token esperado
 * @param {string} phoneNumber - Número de telefone para logs
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateAuthentication(req, expectedToken, phoneNumber) {
  const bearerToken = req.headers.authorization;

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

  if (token !== expectedToken) {
    return {
      success: false,
      error: {
        status: 401,
        message: '401: UNAUTHORIZED - Token inválido',
      },
    };
  }

  return { success: true };
}

/**
 * Função para validar dados da mensagem
 * @param {string} phoneNumber - Número de telefone
 * @param {Object} messageData - Dados da mensagem
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateMessageData(phoneNumber, messageData) {
  // Validar número de telefone brasileiro
  if (!phoneNumber || !isValidBrazilianPhone(phoneNumber)) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Número de telefone brasileiro inválido',
      },
    };
  }

  // Validar mensagem
  if (!messageData || !messageData.type) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados da mensagem são obrigatórios',
      },
    };
  }

  return { success: true };
}

/**
 * Função para validar dados de anexo
 * @param {Object} attachment - Dados do anexo
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateAttachment(attachment) {
  if (!attachment) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados do anexo são obrigatórios',
      },
    };
  }

  if (!attachment.url) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'URL do anexo é obrigatória',
      },
    };
  }

  // Validar tipos de anexo suportados
  const supportedTypes = ['image', 'video', 'audio', 'file'];
  if (attachment.type && !supportedTypes.includes(attachment.type)) {
    return {
      success: false,
      error: {
        status: 400,
        message: `Tipo de anexo não suportado. Tipos suportados: ${supportedTypes.join(
          ', '
        )}`,
      },
    };
  }

  return { success: true };
}

/**
 * Função para validar dados de webhook do DigiSac
 * @param {Object} webhookData - Dados do webhook
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateDigiSacWebhook(webhookData) {
  if (!webhookData) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados do webhook são obrigatórios',
      },
    };
  }

  if (!webhookData.event) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Tipo de evento é obrigatório',
      },
    };
  }

  if (!webhookData.data) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados do evento são obrigatórios',
      },
    };
  }

  return { success: true };
}

/**
 * Função para validar dados de contato
 * @param {Object} contactData - Dados do contato
 * @returns {Object} - { success: boolean, error?: Object }
 */
function validateContactData(contactData) {
  if (!contactData) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Dados do contato são obrigatórios',
      },
    };
  }

  if (!contactData.phone && !contactData.number) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Número de telefone do contato é obrigatório',
      },
    };
  }

  const phoneNumber = contactData.phone || contactData.number;
  if (!isValidBrazilianPhone(phoneNumber)) {
    return {
      success: false,
      error: {
        status: 400,
        message: 'Número de telefone do contato é inválido',
      },
    };
  }

  return { success: true };
}

/**
 * Função para validar configurações de ambiente
 * @returns {Object} - { success: boolean, errors: Array }
 */
function validateEnvironmentConfig() {
  const errors = [];
  const requiredVars = [
    'DIGISAC_API_TOKEN',
    'RESPOND_IO_TOKEN',
    'RESPOND_IO_CHANNEL_ID',
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Variável de ambiente ${varName} não está configurada`);
    }
  }

  return {
    success: errors.length === 0,
    errors: errors,
  };
}

/**
 * Função para validar URL
 * @param {string} url - URL a ser validada
 * @returns {boolean} - Se a URL é válida
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Função para validar MIME type
 * @param {string} mimeType - MIME type a ser validado
 * @returns {boolean} - Se o MIME type é válido
 */
function isValidMimeType(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') {
    return false;
  }

  // Padrão básico para MIME types
  const mimeTypePattern = /^[a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9!#$&\-\^_]*$/;
  return mimeTypePattern.test(mimeType);
}

module.exports = {
  isValidBrazilianPhone,
  validateAuthentication,
  validateMessageData,
  validateAttachment,
  validateDigiSacWebhook,
  validateContactData,
  validateEnvironmentConfig,
  isValidUrl,
  isValidMimeType,
};
