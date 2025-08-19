/**
 * Logger utilities for the DigiSac ↔ Respond.io integration
 * Centralized logging functions with conditional output based on sandbox mode
 */

// Configuração de nível de log
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug | info | error

/**
 * Função helper para logs condicionais
 * Agora respeita LOG_LEVEL para reduzir verbosidade em produção
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function conditionalLog(phoneNumber, message, data = null) {
  // Só logar se LOG_LEVEL for debug ou info
  if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info') {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

/**
 * Função helper para logs sempre visíveis (erros, health check, etc.)
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function alwaysLog(message, data = null) {
  // Sempre logar, mas reduzir verbosidade em produção
  if (LOG_LEVEL === 'error' && data && typeof data === 'object') {
    // Em produção, não fazer JSON.stringify de objetos grandes
    console.log(message);
  } else {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  }
}

/**
 * Função para logs de erro sempre visíveis
 * @param {string} message - Mensagem do erro
 * @param {any} error - Objeto de erro
 */
function errorLog(message, error = null) {
  if (error) {
    console.error(`❌ ${message}:`, error);
  } else {
    console.error(`❌ ${message}`);
  }
}

/**
 * Função para logs de debug (só visível em debug mode)
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do debug
 * @param {any} data - Dados adicionais (opcional)
 */
function debugLog(phoneNumber, message, data = null) {
  // Só logar se LOG_LEVEL for debug
  if (LOG_LEVEL === 'debug') {
    if (data) {
      console.log(`[DEBUG] ${message}`, data);
    } else {
      console.log(`[DEBUG] ${message}`);
    }
  }
}

/**
 * Função para logs de API (sempre visíveis para APIs externas)
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function apiLog(message, data = null) {
  // Só logar se LOG_LEVEL for debug ou info
  if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info') {
    if (data) {
      console.log(`[API] ${message}`, data);
    } else {
      console.log(`[API] ${message}`);
    }
  }
}

module.exports = {
  conditionalLog,
  alwaysLog,
  errorLog,
  debugLog,
  apiLog,
};
