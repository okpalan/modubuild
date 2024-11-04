/**
 * const graph = new DepGraph();

// Add modules
graph.addModule('main.js', { path: '/src/main.js', code: '...' }, true);
graph.addModule('utils.js', { path: '/src/utils.js', code: '...' });

// Add dependencies
graph.addDependency('main.js', 'utils.js');

// Get execution order
const order = graph.getModuleExecutionOrder();

// Check for circular dependencies
const cycles = graph.findCircularDependencies();

// Get graph summary
const summary = graph.getGraphSummary();
 */
class DepGraph {
    constructor() {
      // Map of moduleId -> Module metadata
      this.nodes = new Map();
      // Map of moduleId -> Set of dependent moduleIds
      this.incomingEdges = new Map();
      // Map of moduleId -> Set of dependency moduleIds
      this.outgoingEdges = new Map();
      // Keep track of the entry points
      this.entryNodes = new Set();
    }
  
    /**
     * Add a module to the dependency graph
     * @param {string} moduleId - Unique identifier for the module
     * @param {Object} metadata - Module metadata (path, code, etc.)
     * @param {boolean} isEntry - Whether this is an entry point
     */
    addModule(moduleId, metadata, isEntry = false) {
      if (this.nodes.has(moduleId)) {
        throw new Error(`Module ${moduleId} already exists in the graph`);
      }
  
      this.nodes.set(moduleId, {
        id: moduleId,
        ...metadata,
        timestamp: Date.now()
      });
  
      this.incomingEdges.set(moduleId, new Set());
      this.outgoingEdges.set(moduleId, new Set());
  
      if (isEntry) {
        this.entryNodes.add(moduleId);
      }
  
      return this;
    }
  
    /**
     * Add a dependency relationship between modules
     * @param {string} fromId - ID of the dependent module
     * @param {string} toId - ID of the dependency module
     */
    addDependency(fromId, toId) {
      if (!this.nodes.has(fromId)) {
        throw new Error(`Source module ${fromId} does not exist`);
      }
      if (!this.nodes.has(toId)) {
        throw new Error(`Target module ${toId} does not exist`);
      }
  
      this.outgoingEdges.get(fromId).add(toId);
      this.incomingEdges.get(toId).add(fromId);
  
      return this;
    }
  
    /**
     * Get all dependencies for a module (direct and indirect)
     * @param {string} moduleId - ID of the module
     * @returns {Set<string>} Set of all dependency moduleIds
     */
    getAllDependencies(moduleId) {
      const visited = new Set();
      const dependencies = new Set();
  
      const traverse = (currentId) => {
        if (visited.has(currentId)) return;
        visited.add(currentId);
  
        const outgoing = this.outgoingEdges.get(currentId);
        if (outgoing) {
          for (const depId of outgoing) {
            dependencies.add(depId);
            traverse(depId);
          }
        }
      };
  
      traverse(moduleId);
      return dependencies;
    }
  
    /**
     * Check for circular dependencies
     * @returns {Array<Array<string>>} Array of circular dependency chains
     */
    findCircularDependencies() {
      const cycles = [];
      const visited = new Set();
      const recursionStack = new Set();
  
      const detectCycle = (moduleId, path = []) => {
        if (recursionStack.has(moduleId)) {
          const cycleStart = path.indexOf(moduleId);
          cycles.push(path.slice(cycleStart));
          return;
        }
  
        if (visited.has(moduleId)) return;
  
        visited.add(moduleId);
        recursionStack.add(moduleId);
        path.push(moduleId);
  
        const dependencies = this.outgoingEdges.get(moduleId);
        if (dependencies) {
          for (const depId of dependencies) {
            detectCycle(depId, [...path]);
          }
        }
  
        recursionStack.delete(moduleId);
      };
  
      for (const moduleId of this.nodes.keys()) {
        if (!visited.has(moduleId)) {
          detectCycle(moduleId);
        }
      }
  
      return cycles;
    }
  
    /**
     * Get modules in correct dependency order
     * @returns {Array<string>} Array of moduleIds in dependency order
     */
    getModuleExecutionOrder() {
      const visited = new Set();
      const order = [];
  
      const visit = (moduleId) => {
        if (visited.has(moduleId)) return;
        visited.add(moduleId);
  
        const dependencies = this.outgoingEdges.get(moduleId);
        if (dependencies) {
          for (const depId of dependencies) {
            visit(depId);
          }
        }
  
        order.push(moduleId);
      };
  
      // Start with entry points
      for (const entryId of this.entryNodes) {
        visit(entryId);
      }
  
      // Handle any disconnected modules
      for (const moduleId of this.nodes.keys()) {
        visit(moduleId);
      }
  
      return order;
    }
  
    /**
     * Remove a module and all its dependencies
     * @param {string} moduleId - ID of the module to remove
     */
    removeModule(moduleId) {
      if (!this.nodes.has(moduleId)) {
        throw new Error(`Module ${moduleId} does not exist`);
      }
  
      // Remove incoming edges
      const incomingModules = this.incomingEdges.get(moduleId);
      for (const incoming of incomingModules) {
        this.outgoingEdges.get(incoming).delete(moduleId);
      }
  
      // Remove outgoing edges
      const outgoingModules = this.outgoingEdges.get(moduleId);
      for (const outgoing of outgoingModules) {
        this.incomingEdges.get(outgoing).delete(moduleId);
      }
  
      // Remove from data structures
      this.nodes.delete(moduleId);
      this.incomingEdges.delete(moduleId);
      this.outgoingEdges.delete(moduleId);
      this.entryNodes.delete(moduleId);
  
      return this;
    }
  
    /**
     * Get metadata about a specific module
     * @param {string} moduleId - ID of the module
     * @returns {Object} Module metadata
     */
    getModule(moduleId) {
      const module = this.nodes.get(moduleId);
      if (!module) {
        throw new Error(`Module ${moduleId} does not exist`);
      }
      return { ...module };
    }
  
    /**
     * Get a summary of the dependency graph
     * @returns {Object} Graph summary
     */
    getGraphSummary() {
      return {
        totalModules: this.nodes.size,
        entryPoints: Array.from(this.entryNodes),
        circularDependencies: this.findCircularDependencies(),
        executionOrder: this.getModuleExecutionOrder()
      };
    }
  }
  
  module.exports =  DepGraph