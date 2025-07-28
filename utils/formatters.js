/**
 * Formatters utilities for the DigiSac ↔ Respond.io integration
 * Functions for data formatting and transformation
 */

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
 * Função para formatar número de telefone para exibição
 * @param {string} phoneNumber - Número do telefone
 * @returns {string} - Número formatado para exibição
 */
function formatPhoneForDisplay(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, '');

  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const countryCode = cleaned.substring(0, 2);
    const ddd = cleaned.substring(2, 4);
    const number = cleaned.substring(4);

    if (number.length === 8) {
      return `+${countryCode} (${ddd}) ${number.substring(
        0,
        4
      )}-${number.substring(4)}`;
    } else if (number.length === 9) {
      return `+${countryCode} (${ddd}) ${number.substring(
        0,
        5
      )}-${number.substring(5)}`;
    }
  }

  return phoneNumber;
}

/**
 * Função para formatar timestamp para ISO string
 * @param {number|string|Date} timestamp - Timestamp a ser formatado
 * @returns {string} - Timestamp formatado em ISO
 */
function formatTimestamp(timestamp) {
  if (!timestamp) {
    return Date.now();
  }

  if (typeof timestamp === 'number') {
    return timestamp;
  }

  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }

  return new Date(timestamp).getTime();
}

/**
 * Função para formatar dados de contato para respond.io
 * @param {Object} contactData - Dados do contato do DigiSac
 * @param {string} phoneNumber - Número de telefone
 * @returns {Object} - Dados formatados para respond.io
 */
function formatContactForRespondIo(contactData, phoneNumber) {
  // Processar nome brasileiro - primeiro nome e sobrenome
  let firstName = '';
  let lastName = '';

  if (contactData.name) {
    const nameParts = contactData.name.trim().split(' ');
    if (nameParts.length === 1) {
      // Apenas um nome
      firstName = nameParts[0];
    } else if (nameParts.length === 2) {
      // Dois nomes - primeiro e último
      firstName = nameParts[0];
      lastName = nameParts[1];
    } else {
      // Mais de dois nomes - primeiro nome e resto como sobrenome
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    }
  }

  // Garantir que o número de telefone tenha o formato correto (+55)
  let formattedPhone = phoneNumber;
  if (formattedPhone && !formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('55')) {
      formattedPhone = '+' + formattedPhone;
    } else if (formattedPhone.length >= 10) {
      formattedPhone = '+55' + formattedPhone;
    }
  }

  return {
    firstName: firstName,
    lastName: lastName,
    profilePic: contactData.profilePic || contactData.avatar || '',
    countryCode: contactData.countryCode || 'BR',
    email: contactData.email || '',
    phone: formattedPhone,
    language: contactData.language || 'pt-BR',
  };
}

/**
 * Função para formatar dados de mensagem para respond.io
 * @param {Object} messageData - Dados da mensagem
 * @param {string} messageId - ID da mensagem
 * @param {string} contactPhoneNumber - Número do contato
 * @param {number} timestamp - Timestamp da mensagem
 * @param {boolean} isFromMe - Se a mensagem é do agente
 * @returns {Object} - Dados formatados para respond.io
 */
function formatMessageForRespondIo(
  messageData,
  messageId,
  contactPhoneNumber,
  timestamp,
  isFromMe = false
) {
  // Garantir que o contactId tenha o formato correto (+55)
  let formattedContactId = contactPhoneNumber;
  if (formattedContactId && !formattedContactId.startsWith('+')) {
    if (formattedContactId.startsWith('55')) {
      formattedContactId = '+' + formattedContactId;
    } else if (formattedContactId.length >= 10) {
      formattedContactId = '+55' + formattedContactId;
    }
  }

  return {
    channelId: process.env.RESPOND_IO_CHANNEL_ID || 'digisac_channel_001',
    contactId: formattedContactId,
    events: [
      {
        type: isFromMe ? 'message_echo' : 'message',
        mId: messageId,
        timestamp: formatTimestamp(timestamp),
        message: messageData,
      },
    ],
  };
}

/**
 * Função para formatar dados de arquivo para DigiSac
 * @param {Object} attachment - Dados do anexo do respond.io
 * @returns {Object} - Dados formatados para DigiSac
 */
function formatAttachmentForDigiSac(attachment) {
  return {
    base64: attachment.base64,
    mimetype:
      attachment.mimeType || attachment.mimetype || 'application/octet-stream',
    name: attachment.fileName || attachment.name || 'arquivo',
  };
}

/**
 * Função para formatar resposta de erro
 * @param {string} message - Mensagem de erro
 * @param {any} details - Detalhes do erro
 * @param {number} status - Status code
 * @returns {Object} - Resposta de erro formatada
 */
function formatErrorResponse(message, details = null, status = 400) {
  const response = {
    error: {
      message: message,
    },
  };

  if (details) {
    response.error.details = details;
  }

  return response;
}

/**
 * Função para formatar resposta de sucesso
 * @param {any} data - Dados da resposta
 * @param {string} message - Mensagem de sucesso
 * @returns {Object} - Resposta de sucesso formatada
 */
function formatSuccessResponse(data = null, message = 'Success') {
  const response = {
    status: 'success',
    message: message,
  };

  if (data) {
    response.data = data;
  }

  return response;
}

module.exports = {
  formatBrazilianPhoneNumber,
  formatPhoneForDisplay,
  formatTimestamp,
  formatContactForRespondIo,
  formatMessageForRespondIo,
  formatAttachmentForDigiSac,
  formatErrorResponse,
  formatSuccessResponse,
};
