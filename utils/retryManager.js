/**
 * Sistema de retry para operações que podem falhar
 * Implementa backoff exponencial e logging detalhado
 */

class RetryManager {
  constructor(maxRetries = 3, baseDelay = 1000, maxDelay = 10000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.stats = {
      totalOperations: 0,
      successOnFirstTry: 0,
      successWithRetry: 0,
      totalFailures: 0,
      retriesUsed: 0
    };
  }

  /**
   * Executa uma operação com retry automático
   */
  async executeWithRetry(operation, context = {}) {
    this.stats.totalOperations++;
    let lastError;
    const operationName = context.operation || 'Operação';
    const webhookId = context.webhookId || 'N/A';
    
    console.log(`\n🔄 INICIANDO OPERAÇÃO COM RETRY`);
    console.log(`📝 Operação: ${operationName}`);
    console.log(`🆔 Webhook ID: ${webhookId}`);
    console.log(`🔢 Max tentativas: ${this.maxRetries}`);
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      const attemptStartTime = Date.now();
      
      try {
        console.log(`\n🎯 TENTATIVA ${attempt}/${this.maxRetries}`);
        console.log(`⏰ Iniciada em: ${new Date().toISOString()}`);
        
        const result = await operation();
        const attemptTime = Date.now() - attemptStartTime;
        
        console.log(`✅ SUCESSO NA TENTATIVA ${attempt}`);
        console.log(`⏱️ Tempo da tentativa: ${attemptTime}ms`);
        
        if (attempt === 1) {
          this.stats.successOnFirstTry++;
        } else {
          this.stats.successWithRetry++;
          this.stats.retriesUsed += (attempt - 1);
        }
        
        return result;
        
      } catch (error) {
        lastError = error;
        const attemptTime = Date.now() - attemptStartTime;
        
        console.error(`❌ FALHA NA TENTATIVA ${attempt}`);
        console.error(`⏱️ Tempo da tentativa: ${attemptTime}ms`);
        console.error(`🔥 Erro: ${error.message}`);
        
        // Log do stack trace apenas na última tentativa ou em modo debug
        if (attempt === this.maxRetries || process.env.LOG_LEVEL === 'debug') {
          console.error(`📍 Stack trace:`);
          console.error(error.stack);
        }
        
        // Se não é a última tentativa, aguardar antes de tentar novamente
        if (attempt < this.maxRetries) {
          const delay = Math.min(
            this.baseDelay * Math.pow(2, attempt - 1),
            this.maxDelay
          );
          
          console.log(`⏳ AGUARDANDO ${delay}ms ANTES DA PRÓXIMA TENTATIVA...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    this.stats.totalFailures++;
    this.stats.retriesUsed += (this.maxRetries - 1);
    
    console.error(`\n💥 TODAS AS TENTATIVAS FALHARAM`);
    console.error(`📝 Operação: ${operationName}`);
    console.error(`🆔 Webhook ID: ${webhookId}`);
    console.error(`🔢 Tentativas realizadas: ${this.maxRetries}`);
    console.error(`🔥 Último erro: ${lastError.message}`);
    
    throw new Error(`Operação falhou após ${this.maxRetries} tentativas: ${lastError.message}`);
  }

  /**
   * Executa uma operação com retry específico para chamadas HTTP
   */
  async executeHttpWithRetry(httpOperation, context = {}) {
    return this.executeWithRetry(async () => {
      try {
        const result = await httpOperation();
        
        // Verificar se a resposta HTTP indica sucesso
        if (result && result.status && result.status >= 200 && result.status < 300) {
          return result;
        } else if (result && result.success !== undefined) {
          // Para APIs que retornam { success: boolean }
          if (result.success) {
            return result;
          } else {
            throw new Error(`API retornou erro: ${result.error || 'Erro desconhecido'}`);
          }
        } else {
          return result; // Assumir sucesso se não há indicação contrária
        }
      } catch (error) {
        // Verificar se é um erro que vale a pena tentar novamente
        if (this.isRetryableError(error)) {
          throw error; // Permite retry
        } else {
          // Erro não recuperável - não fazer retry
          console.log(`🚫 ERRO NÃO RECUPERÁVEL - NÃO FAZENDO RETRY: ${error.message}`);
          throw new Error(`Erro não recuperável: ${error.message}`);
        }
      }
    }, {
      ...context,
      operation: context.operation || 'Operação HTTP'
    });
  }

  /**
   * Verifica se um erro é recuperável (vale a pena tentar novamente)
   */
  isRetryableError(error) {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED', 
      'ETIMEDOUT',
      'ENOTFOUND',
      'socket hang up',
      'timeout',
      'Network Error'
    ];
    
    const errorMessage = error.message || '';
    const errorCode = error.code || '';
    
    // Verificar códigos de status HTTP que podem ser recuperados
    if (error.response && error.response.status) {
      const status = error.response.status;
      // 5xx são erros do servidor (recuperáveis)
      // 429 é rate limiting (recuperável)
      // 408 é timeout (recuperável)
      return status >= 500 || status === 429 || status === 408;
    }
    
    // Verificar mensagens de erro recuperáveis
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) || errorCode.includes(retryableError)
    );
  }

  /**
   * Retorna estatísticas do retry manager
   */
  getStats() {
    const totalSuccesses = this.stats.successOnFirstTry + this.stats.successWithRetry;
    const successRate = this.stats.totalOperations > 0 
      ? Math.round((totalSuccesses / this.stats.totalOperations) * 100)
      : 0;
    
    const avgRetriesPerOperation = this.stats.totalOperations > 0
      ? Math.round((this.stats.retriesUsed / this.stats.totalOperations) * 100) / 100
      : 0;

    return {
      ...this.stats,
      successRate: successRate,
      avgRetriesPerOperation: avgRetriesPerOperation,
      firstTrySuccessRate: this.stats.totalOperations > 0
        ? Math.round((this.stats.successOnFirstTry / this.stats.totalOperations) * 100)
        : 0
    };
  }

  /**
   * Reseta as estatísticas
   */
  resetStats() {
    this.stats = {
      totalOperations: 0,
      successOnFirstTry: 0,
      successWithRetry: 0,
      totalFailures: 0,
      retriesUsed: 0
    };
    console.log('📊 ESTATÍSTICAS DO RETRY MANAGER RESETADAS');
  }
}

// Criar instância singleton
const retryManager = new RetryManager();

module.exports = retryManager;
