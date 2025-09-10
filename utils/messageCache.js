/**
 * Sistema de cache para evitar processamento de mensagens duplicadas
 * Mantém controle de mensagens já processadas para evitar reprocessamento
 */

class MessageCache {
  constructor(ttl = 300000) { // 5 minutos por padrão
    this.cache = new Map();
    this.ttl = ttl;
    this.stats = {
      hits: 0,
      misses: 0,
      duplicates: 0,
      cleanups: 0
    };
    
    // Cleanup automático a cada 2 minutos
    setInterval(() => {
      this.cleanup();
    }, 120000);
  }

  /**
   * Gera uma chave única para a mensagem baseada em múltiplos campos
   */
  generateKey(messageData) {
    const messageId = messageData.id || messageData.messageId || messageData._id;
    const from = messageData.from || messageData.fromId || messageData.contactId || messageData.number;
    const timestamp = messageData.timestamp || messageData.createdAt || Date.now();
    const content = messageData.message || messageData.text || messageData.content || '';
    
    // Criar hash simples baseado nos dados
    const dataString = `${messageId}_${from}_${timestamp}_${content.substring(0, 50)}`;
    return dataString.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Verifica se uma mensagem é duplicada
   */
  isDuplicate(messageData) {
    const key = this.generateKey(messageData);
    const cached = this.cache.get(key);
    
    if (cached && (Date.now() - cached.timestamp) < this.ttl) {
      this.stats.duplicates++;
      this.stats.hits++;
      console.log(`🔄 MENSAGEM DUPLICADA DETECTADA: ${key}`);
      console.log(`⏰ Processada há ${Math.round((Date.now() - cached.timestamp) / 1000)}s`);
      return true;
    }
    
    this.stats.misses++;
    return false;
  }

  /**
   * Marca uma mensagem como processada
   */
  markAsProcessed(messageData, additionalInfo = {}) {
    const key = this.generateKey(messageData);
    const cacheEntry = {
      timestamp: Date.now(),
      processed: true,
      messageId: messageData.id || messageData.messageId || messageData._id,
      from: messageData.from || messageData.fromId || messageData.contactId || messageData.number,
      ...additionalInfo
    };
    
    this.cache.set(key, cacheEntry);
    
    console.log(`📝 MENSAGEM MARCADA COMO PROCESSADA: ${key}`);
    
    // Limpar cache antigo periodicamente
    if (this.cache.size % 50 === 0) {
      this.cleanup();
    }
  }

  /**
   * Remove entradas antigas do cache
   */
  cleanup() {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      this.stats.cleanups++;
      console.log(`🧹 CACHE CLEANUP: ${removedCount} entradas antigas removidas`);
    }
  }

  /**
   * Força limpeza de uma mensagem específica
   */
  forceRemove(messageData) {
    const key = this.generateKey(messageData);
    const removed = this.cache.delete(key);
    
    if (removed) {
      console.log(`🗑️ ENTRADA REMOVIDA DO CACHE: ${key}`);
    }
    
    return removed;
  }

  /**
   * Retorna estatísticas do cache
   */
  getStats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
      ...this.stats,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? Math.round((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100)
        : 0
    };
  }

  /**
   * Reseta estatísticas
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      duplicates: 0,
      cleanups: 0
    };
    console.log('📊 ESTATÍSTICAS DO CACHE RESETADAS');
  }

  /**
   * Limpa todo o cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️ CACHE LIMPO COMPLETAMENTE: ${size} entradas removidas`);
  }

  /**
   * Lista todas as entradas do cache (para debug)
   */
  listAll() {
    const entries = [];
    for (const [key, value] of this.cache.entries()) {
      entries.push({
        key,
        age: Math.round((Date.now() - value.timestamp) / 1000),
        messageId: value.messageId,
        from: value.from
      });
    }
    return entries;
  }
}

// Criar instância singleton
const messageCache = new MessageCache();

module.exports = messageCache;
