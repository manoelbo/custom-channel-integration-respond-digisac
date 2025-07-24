/**
 * Logger utilities for the DigiSac ↔ Respond.io integration
 * Centralized logging functions with conditional output based on sandbox mode
 */

/**
 * Função helper para logs condicionais
 * Agora sempre mostra logs detalhados (sandbox removido)
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function conditionalLog(phoneNumber, message, data = null) {
  if (data) {
    console.log(message, data);
  } else {
    console.log(message);
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
 * Função para logs de debug (agora sempre visível)
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do debug
 * @param {any} data - Dados adicionais (opcional)
 */
function debugLog(phoneNumber, message, data = null) {
  if (data) {
    console.log(`[DEBUG] ${message}`, data);
  } else {
    console.log(`[DEBUG] ${message}`);
  }
}

/**
 * Função para logs de API (sempre visíveis para APIs externas)
 * @param {string} message - Mensagem do log
 * @param {any} data - Dados adicionais (opcional)
 */
function apiLog(message, data = null) {
  if (data) {
    console.log(`[API] ${message}`, data);
  } else {
    console.log(`[API] ${message}`);
  }
}

module.exports = {
  conditionalLog,
  alwaysLog,
  errorLog,
  debugLog,
  apiLog,
};
