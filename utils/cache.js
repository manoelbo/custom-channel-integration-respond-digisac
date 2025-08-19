/**
 * Cache utilities for the DigiSac ↔ Respond.io integration
 * Simple in-memory cache with TTL (Time To Live)
 */

/**
 * Classe para cache simples em memória com TTL
 */
class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  /**
   * Armazenar valor no cache com TTL
   * @param {string} key - Chave do cache
   * @param {any} value - Valor a ser armazenado
   * @param {number} ttlMs - Tempo de vida em milissegundos (padrão: 10 min)
   */
  set(key, value, ttlMs = 600000) {
    // Limpar timer existente se houver
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Armazenar valor
    this.cache.set(key, value);

    // Configurar expiração
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttlMs);

    this.timers.set(key, timer);
  }

  /**
   * Obter valor do cache
   * @param {string} key - Chave do cache
   * @returns {any|null} - Valor armazenado ou null se não encontrado/expirado
   */
  get(key) {
    return this.cache.get(key) || null;
  }

  /**
   * Verificar se chave existe no cache
   * @param {string} key - Chave do cache
   * @returns {boolean} - Se a chave existe
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Remover item do cache
   * @param {string} key - Chave do cache
   * @returns {boolean} - Se o item foi removido
   */
  delete(key) {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
    return this.cache.delete(key);
  }

  /**
   * Limpar todo o cache
   */
  clear() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.cache.clear();
    this.timers.clear();
  }

  /**
   * Obter tamanho do cache
   * @returns {number} - Número de itens no cache
   */
  size() {
    return this.cache.size;
  }

  /**
   * Obter estatísticas do cache
   * @returns {Object} - Estatísticas do cache
   */
  getStats() {
    return {
      size: this.cache.size,
      timers: this.timers.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Instância singleton do cache
const cache = new SimpleCache();

module.exports = { cache, SimpleCache };
