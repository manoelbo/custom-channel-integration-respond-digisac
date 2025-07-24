/**
 * Logger utilities for the DigiSac ↔ Respond.io integration
 * Centralized logging functions with conditional output based on sandbox mode
 */

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
 * Função para logs de debug (só em modo sandbox)
 * @param {string} phoneNumber - Número de telefone
 * @param {string} message - Mensagem do debug
 * @param {any} data - Dados adicionais (opcional)
 */
function debugLog(phoneNumber, message, data = null) {
  if (SANDBOX_MODE && SANDBOX_NUMBERS.includes(phoneNumber)) {
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
  SANDBOX_MODE,
  SANDBOX_NUMBERS,
};
