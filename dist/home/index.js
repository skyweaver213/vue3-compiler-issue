(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.App = factory());
}(this, (function () { 'use strict';

  var script = {
    name: "HelloWorld",
    props: {
      msg: String
    }
  };

  /**
   * Make a map and return a function for checking if a key
   * is in that map.
   * IMPORTANT: all calls of this function must be prefixed with
   * \/\*#\_\_PURE\_\_\*\/
   * So that rollup can tree-shake them if necessary.
   */
  const EMPTY_OBJ = process.env.NODE_ENV !== 'production' ? Object.freeze({}) : {};

  const extend = Object.assign;

  const hasOwnProperty = Object.prototype.hasOwnProperty;

  const hasOwn = (val, key) => hasOwnProperty.call(val, key);

  const isArray = Array.isArray;

  const isString = val => typeof val === 'string';

  const isSymbol = val => typeof val === 'symbol';

  const isObject = val => val !== null && typeof val === 'object';

  const objectToString = Object.prototype.toString;

  const toTypeString = value => objectToString.call(value);

  const toRawType = value => {
    return toTypeString(value).slice(8, -1);
  };

  const isIntegerKey = key => isString(key) && key[0] !== '-' && '' + parseInt(key, 10) === key;

  const cacheStringFunction = fn => {
    const cache = Object.create(null);
    return str => {
      const hit = cache[str];
      return hit || (cache[str] = fn(str));
    };
  };
  /**
   * @private
   */

  const capitalize = cacheStringFunction(str => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }); // compare whether a value has changed, accounting for NaN.

  const hasChanged = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);

  const targetMap = new WeakMap();
  const effectStack = [];
  let activeEffect;
  const ITERATE_KEY = Symbol(process.env.NODE_ENV !== 'production' ? 'iterate' : '');
  const MAP_KEY_ITERATE_KEY = Symbol(process.env.NODE_ENV !== 'production' ? 'Map key iterate' : '');

  function isEffect(fn) {
    return fn && fn._isEffect === true;
  }

  function effect(fn, options = EMPTY_OBJ) {
    if (isEffect(fn)) {
      fn = fn.raw;
    }

    const effect = createReactiveEffect(fn, options);

    if (!options.lazy) {
      effect();
    }

    return effect;
  }

  function stop(effect) {
    if (effect.active) {
      cleanup(effect);

      if (effect.options.onStop) {
        effect.options.onStop();
      }

      effect.active = false;
    }
  }

  let uid = 0;

  function createReactiveEffect(fn, options) {
    const effect = function reactiveEffect() {
      if (!effect.active) {
        return options.scheduler ? undefined : fn();
      }

      if (!effectStack.includes(effect)) {
        cleanup(effect);

        try {
          enableTracking();
          effectStack.push(effect);
          activeEffect = effect;
          return fn();
        } finally {
          effectStack.pop();
          resetTracking();
          activeEffect = effectStack[effectStack.length - 1];
        }
      }
    };

    effect.id = uid++;
    effect._isEffect = true;
    effect.active = true;
    effect.raw = fn;
    effect.deps = [];
    effect.options = options;
    return effect;
  }

  function cleanup(effect) {
    const {
      deps
    } = effect;

    if (deps.length) {
      for (let i = 0; i < deps.length; i++) {
        deps[i].delete(effect);
      }

      deps.length = 0;
    }
  }

  let shouldTrack = true;
  const trackStack = [];

  function pauseTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = false;
  }

  function enableTracking() {
    trackStack.push(shouldTrack);
    shouldTrack = true;
  }

  function resetTracking() {
    const last = trackStack.pop();
    shouldTrack = last === undefined ? true : last;
  }

  function track(target, type, key) {
    if (!shouldTrack || activeEffect === undefined) {
      return;
    }

    let depsMap = targetMap.get(target);

    if (!depsMap) {
      targetMap.set(target, depsMap = new Map());
    }

    let dep = depsMap.get(key);

    if (!dep) {
      depsMap.set(key, dep = new Set());
    }

    if (!dep.has(activeEffect)) {
      dep.add(activeEffect);
      activeEffect.deps.push(dep);

      if (process.env.NODE_ENV !== 'production' && activeEffect.options.onTrack) {
        activeEffect.options.onTrack({
          effect: activeEffect,
          target,
          type,
          key
        });
      }
    }
  }

  function trigger(target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target);

    if (!depsMap) {
      // never been tracked
      return;
    }

    const effects = new Set();

    const add = effectsToAdd => {
      if (effectsToAdd) {
        effectsToAdd.forEach(effect => {
          if (effect !== activeEffect) {
            effects.add(effect);
          }
        });
      }
    };

    if (type === "clear"
    /* CLEAR */
    ) {
        // collection being cleared
        // trigger all effects for target
        depsMap.forEach(add);
      } else if (key === 'length' && isArray(target)) {
      depsMap.forEach((dep, key) => {
        if (key === 'length' || key >= newValue) {
          add(dep);
        }
      });
    } else {
      // schedule runs for SET | ADD | DELETE
      if (key !== void 0) {
        add(depsMap.get(key));
      } // also run for iteration key on ADD | DELETE | Map.SET


      const shouldTriggerIteration = type === "add"
      /* ADD */
      && (!isArray(target) || isIntegerKey(key)) || type === "delete"
      /* DELETE */
      && !isArray(target);

      if (shouldTriggerIteration || type === "set"
      /* SET */
      && target instanceof Map) {
        add(depsMap.get(isArray(target) ? 'length' : ITERATE_KEY));
      }

      if (shouldTriggerIteration && target instanceof Map) {
        add(depsMap.get(MAP_KEY_ITERATE_KEY));
      }
    }

    const run = effect => {
      if (process.env.NODE_ENV !== 'production' && effect.options.onTrigger) {
        effect.options.onTrigger({
          effect,
          target,
          key,
          type,
          newValue,
          oldValue,
          oldTarget
        });
      }

      if (effect.options.scheduler) {
        effect.options.scheduler(effect);
      } else {
        effect();
      }
    };

    effects.forEach(run);
  }

  const builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol).map(key => Symbol[key]).filter(isSymbol));
  const get = /*#__PURE__*/createGetter();
  const shallowGet = /*#__PURE__*/createGetter(false, true);
  const readonlyGet = /*#__PURE__*/createGetter(true);
  const shallowReadonlyGet = /*#__PURE__*/createGetter(true, true);
  const arrayInstrumentations = {};
  ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
    arrayInstrumentations[key] = function (...args) {
      const arr = toRaw(this);

      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, "get"
        /* GET */
        , i + '');
      } // we run the method using the original args first (which may be reactive)


      const res = arr[key](...args);

      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        return arr[key](...args.map(toRaw));
      } else {
        return res;
      }
    };
  });

  function createGetter(isReadonly = false, shallow = false) {
    return function get(target, key, receiver) {
      if (key === "__v_isReactive"
      /* IS_REACTIVE */
      ) {
          return !isReadonly;
        } else if (key === "__v_isReadonly"
      /* IS_READONLY */
      ) {
          return isReadonly;
        } else if (key === "__v_raw"
      /* RAW */
      && receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)) {
        return target;
      }

      const targetIsArray = isArray(target);

      if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
        return Reflect.get(arrayInstrumentations, key, receiver);
      }

      const res = Reflect.get(target, key, receiver);
      const keyIsSymbol = isSymbol(key);

      if (keyIsSymbol ? builtInSymbols.has(key) : key === `__proto__` || key === `__v_isRef`) {
        return res;
      }

      if (!isReadonly) {
        track(target, "get"
        /* GET */
        , key);
      }

      if (shallow) {
        return res;
      }

      if (isRef(res)) {
        // ref unwrapping - does not apply for Array + integer key.
        const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
        return shouldUnwrap ? res.value : res;
      }

      if (isObject(res)) {
        // Convert returned value into a proxy as well. we do the isObject check
        // here to avoid invalid value warning. Also need to lazy access readonly
        // and reactive here to avoid circular dependency.
        return isReadonly ? readonly(res) : reactive(res);
      }

      return res;
    };
  }

  const set = /*#__PURE__*/createSetter();
  const shallowSet = /*#__PURE__*/createSetter(true);

  function createSetter(shallow = false) {
    return function set(target, key, value, receiver) {
      const oldValue = target[key];

      if (!shallow) {
        value = toRaw(value);

        if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
          oldValue.value = value;
          return true;
        }
      }

      const hadKey = isArray(target) && isIntegerKey(key) ? Number(key) < target.length : hasOwn(target, key);
      const result = Reflect.set(target, key, value, receiver); // don't trigger if target is something up in the prototype chain of original

      if (target === toRaw(receiver)) {
        if (!hadKey) {
          trigger(target, "add"
          /* ADD */
          , key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set"
          /* SET */
          , key, value, oldValue);
        }
      }

      return result;
    };
  }

  function deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    const oldValue = target[key];
    const result = Reflect.deleteProperty(target, key);

    if (result && hadKey) {
      trigger(target, "delete"
      /* DELETE */
      , key, undefined, oldValue);
    }

    return result;
  }

  function has(target, key) {
    const result = Reflect.has(target, key);

    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has"
      /* HAS */
      , key);
    }

    return result;
  }

  function ownKeys(target) {
    track(target, "iterate"
    /* ITERATE */
    , ITERATE_KEY);
    return Reflect.ownKeys(target);
  }

  const mutableHandlers = {
    get,
    set,
    deleteProperty,
    has,
    ownKeys
  };
  const readonlyHandlers = {
    get: readonlyGet,

    set(target, key) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
      }

      return true;
    },

    deleteProperty(target, key) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
      }

      return true;
    }

  };
  const shallowReactiveHandlers = extend({}, mutableHandlers, {
    get: shallowGet,
    set: shallowSet
  }); // Props handlers are special in the sense that it should not unwrap top-level
  // refs (in order to allow refs to be explicitly passed down), but should
  // retain the reactivity of the normal readonly object.

  const shallowReadonlyHandlers = extend({}, readonlyHandlers, {
    get: shallowReadonlyGet
  });

  const toReactive = value => isObject(value) ? reactive(value) : value;

  const toReadonly = value => isObject(value) ? readonly(value) : value;

  const toShallow = value => value;

  const getProto = v => Reflect.getPrototypeOf(v);

  function get$1(target, key, isReadonly = false, isShallow = false) {
    // #1772: readonly(reactive(Map)) should return readonly + reactive version
    // of the value
    target = target["__v_raw"
    /* RAW */
    ];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);

    if (key !== rawKey) {
      !isReadonly && track(rawTarget, "get"
      /* GET */
      , key);
    }

    !isReadonly && track(rawTarget, "get"
    /* GET */
    , rawKey);
    const {
      has
    } = getProto(rawTarget);
    const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;

    if (has.call(rawTarget, key)) {
      return wrap(target.get(key));
    } else if (has.call(rawTarget, rawKey)) {
      return wrap(target.get(rawKey));
    }
  }

  function has$1(key, isReadonly = false) {
    const target = this["__v_raw"
    /* RAW */
    ];
    const rawTarget = toRaw(target);
    const rawKey = toRaw(key);

    if (key !== rawKey) {
      !isReadonly && track(rawTarget, "has"
      /* HAS */
      , key);
    }

    !isReadonly && track(rawTarget, "has"
    /* HAS */
    , rawKey);
    return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
  }

  function size(target, isReadonly = false) {
    target = target["__v_raw"
    /* RAW */
    ];
    !isReadonly && track(toRaw(target), "iterate"
    /* ITERATE */
    , ITERATE_KEY);
    return Reflect.get(target, 'size', target);
  }

  function add(value) {
    value = toRaw(value);
    const target = toRaw(this);
    const proto = getProto(target);
    const hadKey = proto.has.call(target, value);
    const result = proto.add.call(target, value);

    if (!hadKey) {
      trigger(target, "add"
      /* ADD */
      , value, value);
    }

    return result;
  }

  function set$1(key, value) {
    value = toRaw(value);
    const target = toRaw(this);
    const {
      has,
      get,
      set
    } = getProto(target);
    let hadKey = has.call(target, key);

    if (!hadKey) {
      key = toRaw(key);
      hadKey = has.call(target, key);
    } else if (process.env.NODE_ENV !== 'production') {
      checkIdentityKeys(target, has, key);
    }

    const oldValue = get.call(target, key);
    const result = set.call(target, key, value);

    if (!hadKey) {
      trigger(target, "add"
      /* ADD */
      , key, value);
    } else if (hasChanged(value, oldValue)) {
      trigger(target, "set"
      /* SET */
      , key, value, oldValue);
    }

    return result;
  }

  function deleteEntry(key) {
    const target = toRaw(this);
    const {
      has,
      get,
      delete: del
    } = getProto(target);
    let hadKey = has.call(target, key);

    if (!hadKey) {
      key = toRaw(key);
      hadKey = has.call(target, key);
    } else if (process.env.NODE_ENV !== 'production') {
      checkIdentityKeys(target, has, key);
    }

    const oldValue = get ? get.call(target, key) : undefined; // forward the operation before queueing reactions

    const result = del.call(target, key);

    if (hadKey) {
      trigger(target, "delete"
      /* DELETE */
      , key, undefined, oldValue);
    }

    return result;
  }

  function clear() {
    const target = toRaw(this);
    const hadItems = target.size !== 0;
    const oldTarget = process.env.NODE_ENV !== 'production' ? target instanceof Map ? new Map(target) : new Set(target) : undefined; // forward the operation before queueing reactions

    const result = getProto(target).clear.call(target);

    if (hadItems) {
      trigger(target, "clear"
      /* CLEAR */
      , undefined, undefined, oldTarget);
    }

    return result;
  }

  function createForEach(isReadonly, isShallow) {
    return function forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"
      /* RAW */
      ];
      const rawTarget = toRaw(target);
      const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
      !isReadonly && track(rawTarget, "iterate"
      /* ITERATE */
      , ITERATE_KEY);
      return target.forEach((value, key) => {
        // important: make sure the callback is
        // 1. invoked with the reactive map as `this` and 3rd arg
        // 2. the value received should be a corresponding reactive/readonly.
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    };
  }

  function createIterableMethod(method, isReadonly, isShallow) {
    return function (...args) {
      const target = this["__v_raw"
      /* RAW */
      ];
      const rawTarget = toRaw(target);
      const isMap = rawTarget instanceof Map;
      const isPair = method === 'entries' || method === Symbol.iterator && isMap;
      const isKeyOnly = method === 'keys' && isMap;
      const innerIterator = target[method](...args);
      const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
      !isReadonly && track(rawTarget, "iterate"
      /* ITERATE */
      , isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY); // return a wrapped iterator which returns observed versions of the
      // values emitted from the real iterator

      return {
        // iterator protocol
        next() {
          const {
            value,
            done
          } = innerIterator.next();
          return done ? {
            value,
            done
          } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        },

        // iterable protocol
        [Symbol.iterator]() {
          return this;
        }

      };
    };
  }

  function createReadonlyMethod(type) {
    return function (...args) {
      if (process.env.NODE_ENV !== 'production') {
        const key = args[0] ? `on key "${args[0]}" ` : ``;
        console.warn(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
      }

      return type === "delete"
      /* DELETE */
      ? false : this;
    };
  }

  const mutableInstrumentations = {
    get(key) {
      return get$1(this, key);
    },

    get size() {
      return size(this);
    },

    has: has$1,
    add,
    set: set$1,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, false)
  };
  const shallowInstrumentations = {
    get(key) {
      return get$1(this, key, false, true);
    },

    get size() {
      return size(this);
    },

    has: has$1,
    add,
    set: set$1,
    delete: deleteEntry,
    clear,
    forEach: createForEach(false, true)
  };
  const readonlyInstrumentations = {
    get(key) {
      return get$1(this, key, true);
    },

    get size() {
      return size(this, true);
    },

    has(key) {
      return has$1.call(this, key, true);
    },

    add: createReadonlyMethod("add"
    /* ADD */
    ),
    set: createReadonlyMethod("set"
    /* SET */
    ),
    delete: createReadonlyMethod("delete"
    /* DELETE */
    ),
    clear: createReadonlyMethod("clear"
    /* CLEAR */
    ),
    forEach: createForEach(true, false)
  };
  const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator];
  iteratorMethods.forEach(method => {
    mutableInstrumentations[method] = createIterableMethod(method, false, false);
    readonlyInstrumentations[method] = createIterableMethod(method, true, false);
    shallowInstrumentations[method] = createIterableMethod(method, false, true);
  });

  function createInstrumentationGetter(isReadonly, shallow) {
    const instrumentations = shallow ? shallowInstrumentations : isReadonly ? readonlyInstrumentations : mutableInstrumentations;
    return (target, key, receiver) => {
      if (key === "__v_isReactive"
      /* IS_REACTIVE */
      ) {
          return !isReadonly;
        } else if (key === "__v_isReadonly"
      /* IS_READONLY */
      ) {
          return isReadonly;
        } else if (key === "__v_raw"
      /* RAW */
      ) {
          return target;
        }

      return Reflect.get(hasOwn(instrumentations, key) && key in target ? instrumentations : target, key, receiver);
    };
  }

  const mutableCollectionHandlers = {
    get: createInstrumentationGetter(false, false)
  };
  const readonlyCollectionHandlers = {
    get: createInstrumentationGetter(true, false)
  };

  function checkIdentityKeys(target, has, key) {
    const rawKey = toRaw(key);

    if (rawKey !== key && has.call(target, rawKey)) {
      const type = toRawType(target);
      console.warn(`Reactive ${type} contains both the raw and reactive ` + `versions of the same object${type === `Map` ? `as keys` : ``}, ` + `which can lead to inconsistencies. ` + `Avoid differentiating between the raw and reactive versions ` + `of an object and only use the reactive version if possible.`);
    }
  }

  const reactiveMap = new WeakMap();
  const readonlyMap = new WeakMap();

  function targetTypeMap(rawType) {
    switch (rawType) {
      case 'Object':
      case 'Array':
        return 1
        /* COMMON */
        ;

      case 'Map':
      case 'Set':
      case 'WeakMap':
      case 'WeakSet':
        return 2
        /* COLLECTION */
        ;

      default:
        return 0
        /* INVALID */
        ;
    }
  }

  function getTargetType(value) {
    return value["__v_skip"
    /* SKIP */
    ] || !Object.isExtensible(value) ? 0
    /* INVALID */
    : targetTypeMap(toRawType(value));
  }

  function reactive(target) {
    // if trying to observe a readonly proxy, return the readonly version.
    if (target && target["__v_isReadonly"
    /* IS_READONLY */
    ]) {
      return target;
    }

    return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers);
  } // Return a reactive-copy of the original object, where only the root level

  function readonly(target) {
    return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers);
  } // Return a reactive-copy of the original object, where only the root level
  // properties are readonly, and does NOT unwrap refs nor recursively convert
  // returned properties.
  // This is used for creating the props proxy object for stateful components.


  function shallowReadonly(target) {
    return createReactiveObject(target, true, shallowReadonlyHandlers, readonlyCollectionHandlers);
  }

  function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers) {
    if (!isObject(target)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`value cannot be made reactive: ${String(target)}`);
      }

      return target;
    } // target is already a Proxy, return it.
    // exception: calling readonly() on a reactive object


    if (target["__v_raw"
    /* RAW */
    ] && !(isReadonly && target["__v_isReactive"
    /* IS_REACTIVE */
    ])) {
      return target;
    } // target already has corresponding Proxy


    const proxyMap = isReadonly ? readonlyMap : reactiveMap;
    const existingProxy = proxyMap.get(target);

    if (existingProxy) {
      return existingProxy;
    } // only a whitelist of value types can be observed.


    const targetType = getTargetType(target);

    if (targetType === 0
    /* INVALID */
    ) {
        return target;
      }

    const proxy = new Proxy(target, targetType === 2
    /* COLLECTION */
    ? collectionHandlers : baseHandlers);
    proxyMap.set(target, proxy);
    return proxy;
  }

  function isReactive(value) {
    if (isReadonly(value)) {
      return isReactive(value["__v_raw"
      /* RAW */
      ]);
    }

    return !!(value && value["__v_isReactive"
    /* IS_REACTIVE */
    ]);
  }

  function isReadonly(value) {
    return !!(value && value["__v_isReadonly"
    /* IS_READONLY */
    ]);
  }

  function isProxy(value) {
    return isReactive(value) || isReadonly(value);
  }

  function toRaw(observed) {
    return observed && toRaw(observed["__v_raw"
    /* RAW */
    ]) || observed;
  }

  function isRef(r) {
    return Boolean(r && r.__v_isRef === true);
  }

  /**
   * Make a map and return a function for checking if a key
   * is in that map.
   * IMPORTANT: all calls of this function must be prefixed with
   * \/\*#\_\_PURE\_\_\*\/
   * So that rollup can tree-shake them if necessary.
   */
  function makeMap(str, expectsLowerCase) {
    const map = Object.create(null);
    const list = str.split(',');

    for (let i = 0; i < list.length; i++) {
      map[list[i]] = true;
    }

    return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
  } // Patch flags are optimization hints generated by the compiler.
  const GLOBALS_WHITE_LISTED = 'Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,' + 'decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,' + 'Object,Boolean,String,RegExp,Map,Set,JSON,Intl';
  const isGloballyWhitelisted = /*#__PURE__*/makeMap(GLOBALS_WHITE_LISTED);

  function normalizeStyle(value) {
    if (isArray$1(value)) {
      const res = {};

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const normalized = normalizeStyle(isString$1(item) ? parseStringStyle(item) : item);

        if (normalized) {
          for (const key in normalized) {
            res[key] = normalized[key];
          }
        }
      }

      return res;
    } else if (isObject$1(value)) {
      return value;
    }
  }

  const listDelimiterRE = /;(?![^(]*\))/g;
  const propertyDelimiterRE = /:(.+)/;

  function parseStringStyle(cssText) {
    const ret = {};
    cssText.split(listDelimiterRE).forEach(item => {
      if (item) {
        const tmp = item.split(propertyDelimiterRE);
        tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
      }
    });
    return ret;
  }

  function normalizeClass(value) {
    let res = '';

    if (isString$1(value)) {
      res = value;
    } else if (isArray$1(value)) {
      for (let i = 0; i < value.length; i++) {
        res += normalizeClass(value[i]) + ' ';
      }
    } else if (isObject$1(value)) {
      for (const name in value) {
        if (value[name]) {
          res += name + ' ';
        }
      }
    }

    return res.trim();
  } // These tag configs are shared between compiler-dom and runtime-dom, so they
  /**
   * For converting {{ interpolation }} values to displayed strings.
   * @private
   */


  const toDisplayString = val => {
    return val == null ? '' : isObject$1(val) ? JSON.stringify(val, replacer, 2) : String(val);
  };

  const replacer = (_key, val) => {
    if (val instanceof Map) {
      return {
        [`Map(${val.size})`]: [...val.entries()].reduce((entries, [key, val]) => {
          entries[`${key} =>`] = val;
          return entries;
        }, {})
      };
    } else if (val instanceof Set) {
      return {
        [`Set(${val.size})`]: [...val.values()]
      };
    } else if (isObject$1(val) && !isArray$1(val) && !isPlainObject(val)) {
      return String(val);
    }

    return val;
  };
  const EMPTY_OBJ$1 = process.env.NODE_ENV !== 'production' ? Object.freeze({}) : {};
  const EMPTY_ARR = [];

  const NOOP = () => {};

  const onRE = /^on[^a-z]/;

  const isOn = key => onRE.test(key);

  const extend$1 = Object.assign;

  const remove = (arr, el) => {
    const i = arr.indexOf(el);

    if (i > -1) {
      arr.splice(i, 1);
    }
  };

  const hasOwnProperty$1 = Object.prototype.hasOwnProperty;

  const hasOwn$1 = (val, key) => hasOwnProperty$1.call(val, key);

  const isArray$1 = Array.isArray;

  const isFunction = val => typeof val === 'function';

  const isString$1 = val => typeof val === 'string';

  const isObject$1 = val => val !== null && typeof val === 'object';

  const isPromise = val => {
    return isObject$1(val) && isFunction(val.then) && isFunction(val.catch);
  };

  const objectToString$1 = Object.prototype.toString;

  const toTypeString$1 = value => objectToString$1.call(value);

  const isPlainObject = val => toTypeString$1(val) === '[object Object]';

  const cacheStringFunction$1 = fn => {
    const cache = Object.create(null);
    return str => {
      const hit = cache[str];
      return hit || (cache[str] = fn(str));
    };
  };

  const camelizeRE = /-(\w)/g;
  /**
   * @private
   */

  const camelize = cacheStringFunction$1(str => {
    return str.replace(camelizeRE, (_, c) => c ? c.toUpperCase() : '');
  });
  /**
   * @private
   */

  const capitalize$1 = cacheStringFunction$1(str => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }); // compare whether a value has changed, accounting for NaN.

  const hasChanged$1 = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);

  const stack = [];

  function pushWarningContext(vnode) {
    stack.push(vnode);
  }

  function popWarningContext() {
    stack.pop();
  }

  function warn(msg, ...args) {
    // avoid props formatting or warn handler tracking deps that might be mutated
    // during patch, leading to infinite recursion.
    pauseTracking();
    const instance = stack.length ? stack[stack.length - 1].component : null;
    const appWarnHandler = instance && instance.appContext.config.warnHandler;
    const trace = getComponentTrace();

    if (appWarnHandler) {
      callWithErrorHandling(appWarnHandler, instance, 11
      /* APP_WARN_HANDLER */
      , [msg + args.join(''), instance && instance.proxy, trace.map(({
        vnode
      }) => `at <${formatComponentName(instance, vnode.type)}>`).join('\n'), trace]);
    } else {
      const warnArgs = [`[Vue warn]: ${msg}`, ...args];
      /* istanbul ignore if */

      if (trace.length && // avoid spamming console during tests
      !false) {
        warnArgs.push(`\n`, ...formatTrace(trace));
      }

      console.warn(...warnArgs);
    }

    resetTracking();
  }

  function getComponentTrace() {
    let currentVNode = stack[stack.length - 1];

    if (!currentVNode) {
      return [];
    } // we can't just use the stack because it will be incomplete during updates
    // that did not start from the root. Re-construct the parent chain using
    // instance parent pointers.


    const normalizedStack = [];

    while (currentVNode) {
      const last = normalizedStack[0];

      if (last && last.vnode === currentVNode) {
        last.recurseCount++;
      } else {
        normalizedStack.push({
          vnode: currentVNode,
          recurseCount: 0
        });
      }

      const parentInstance = currentVNode.component && currentVNode.component.parent;
      currentVNode = parentInstance && parentInstance.vnode;
    }

    return normalizedStack;
  }
  /* istanbul ignore next */


  function formatTrace(trace) {
    const logs = [];
    trace.forEach((entry, i) => {
      logs.push(...(i === 0 ? [] : [`\n`]), ...formatTraceEntry(entry));
    });
    return logs;
  }

  function formatTraceEntry({
    vnode,
    recurseCount
  }) {
    const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
    const isRoot = vnode.component ? vnode.component.parent == null : false;
    const open = ` at <${formatComponentName(vnode.component, vnode.type, isRoot)}`;
    const close = `>` + postfix;
    return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
  }
  /* istanbul ignore next */


  function formatProps(props) {
    const res = [];
    const keys = Object.keys(props);
    keys.slice(0, 3).forEach(key => {
      res.push(...formatProp(key, props[key]));
    });

    if (keys.length > 3) {
      res.push(` ...`);
    }

    return res;
  }
  /* istanbul ignore next */


  function formatProp(key, value, raw) {
    if (isString$1(value)) {
      value = JSON.stringify(value);
      return raw ? value : [`${key}=${value}`];
    } else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      return raw ? value : [`${key}=${value}`];
    } else if (isRef(value)) {
      value = formatProp(key, toRaw(value.value), true);
      return raw ? value : [`${key}=Ref<`, value, `>`];
    } else if (isFunction(value)) {
      return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
    } else {
      value = toRaw(value);
      return raw ? value : [`${key}=`, value];
    }
  }

  const ErrorTypeStrings = {
    ["bc"
    /* BEFORE_CREATE */
    ]: 'beforeCreate hook',
    ["c"
    /* CREATED */
    ]: 'created hook',
    ["bm"
    /* BEFORE_MOUNT */
    ]: 'beforeMount hook',
    ["m"
    /* MOUNTED */
    ]: 'mounted hook',
    ["bu"
    /* BEFORE_UPDATE */
    ]: 'beforeUpdate hook',
    ["u"
    /* UPDATED */
    ]: 'updated',
    ["bum"
    /* BEFORE_UNMOUNT */
    ]: 'beforeUnmount hook',
    ["um"
    /* UNMOUNTED */
    ]: 'unmounted hook',
    ["a"
    /* ACTIVATED */
    ]: 'activated hook',
    ["da"
    /* DEACTIVATED */
    ]: 'deactivated hook',
    ["ec"
    /* ERROR_CAPTURED */
    ]: 'errorCaptured hook',
    ["rtc"
    /* RENDER_TRACKED */
    ]: 'renderTracked hook',
    ["rtg"
    /* RENDER_TRIGGERED */
    ]: 'renderTriggered hook',
    [0
    /* SETUP_FUNCTION */
    ]: 'setup function',
    [1
    /* RENDER_FUNCTION */
    ]: 'render function',
    [2
    /* WATCH_GETTER */
    ]: 'watcher getter',
    [3
    /* WATCH_CALLBACK */
    ]: 'watcher callback',
    [4
    /* WATCH_CLEANUP */
    ]: 'watcher cleanup function',
    [5
    /* NATIVE_EVENT_HANDLER */
    ]: 'native event handler',
    [6
    /* COMPONENT_EVENT_HANDLER */
    ]: 'component event handler',
    [7
    /* VNODE_HOOK */
    ]: 'vnode hook',
    [8
    /* DIRECTIVE_HOOK */
    ]: 'directive hook',
    [9
    /* TRANSITION_HOOK */
    ]: 'transition hook',
    [10
    /* APP_ERROR_HANDLER */
    ]: 'app errorHandler',
    [11
    /* APP_WARN_HANDLER */
    ]: 'app warnHandler',
    [12
    /* FUNCTION_REF */
    ]: 'ref function',
    [13
    /* ASYNC_COMPONENT_LOADER */
    ]: 'async component loader',
    [14
    /* SCHEDULER */
    ]: 'scheduler flush. This is likely a Vue internals bug. ' + 'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/vue-next'
  };

  function callWithErrorHandling(fn, instance, type, args) {
    let res;

    try {
      res = args ? fn(...args) : fn();
    } catch (err) {
      handleError(err, instance, type);
    }

    return res;
  }

  function callWithAsyncErrorHandling(fn, instance, type, args) {
    if (isFunction(fn)) {
      const res = callWithErrorHandling(fn, instance, type, args);

      if (res && isPromise(res)) {
        res.catch(err => {
          handleError(err, instance, type);
        });
      }

      return res;
    }

    const values = [];

    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }

    return values;
  }

  function handleError(err, instance, type) {
    const contextVNode = instance ? instance.vnode : null;

    if (instance) {
      let cur = instance.parent; // the exposed instance is the render proxy to keep it consistent with 2.x

      const exposedInstance = instance.proxy; // in production the hook receives only the error code

      const errorInfo = process.env.NODE_ENV !== 'production' ? ErrorTypeStrings[type] : type;

      while (cur) {
        const errorCapturedHooks = cur.ec;

        if (errorCapturedHooks) {
          for (let i = 0; i < errorCapturedHooks.length; i++) {
            if (errorCapturedHooks[i](err, exposedInstance, errorInfo)) {
              return;
            }
          }
        }

        cur = cur.parent;
      } // app-level handling


      const appErrorHandler = instance.appContext.config.errorHandler;

      if (appErrorHandler) {
        callWithErrorHandling(appErrorHandler, null, 10
        /* APP_ERROR_HANDLER */
        , [err, exposedInstance, errorInfo]);
        return;
      }
    }

    logError(err, type, contextVNode);
  }

  function logError(err, type, contextVNode) {
    if (process.env.NODE_ENV !== 'production') {
      const info = ErrorTypeStrings[type];

      if (contextVNode) {
        pushWarningContext(contextVNode);
      }

      warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`);

      if (contextVNode) {
        popWarningContext();
      } // crash in dev so it's more noticeable


      throw err;
    } else {
      // recover in prod to reduce the impact on end-user
      console.error(err);
    }
  }

  let isFlushing = false;
  let isFlushPending = false;
  const queue = [];
  let flushIndex = 0;
  const pendingPreFlushCbs = [];
  let activePreFlushCbs = null;
  let preFlushIndex = 0;
  const pendingPostFlushCbs = [];
  let activePostFlushCbs = null;
  let postFlushIndex = 0;
  const resolvedPromise = Promise.resolve();
  let currentFlushPromise = null;
  let currentPreFlushParentJob = null;
  const RECURSION_LIMIT = 100;

  function nextTick(fn) {
    const p = currentFlushPromise || resolvedPromise;
    return fn ? p.then(fn) : p;
  }

  function queueJob(job) {
    // the dedupe search uses the startIndex argument of Array.includes()
    // by default the search index includes the current job that is being run
    // so it cannot recursively trigger itself again.
    // if the job is a watch() callback, the search will start with a +1 index to
    // allow it recursively trigger itself - it is the user's responsibility to
    // ensure it doesn't end up in an infinite loop.
    if ((!queue.length || !queue.includes(job, isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)) && job !== currentPreFlushParentJob) {
      queue.push(job);
      queueFlush();
    }
  }

  function queueFlush() {
    if (!isFlushing && !isFlushPending) {
      isFlushPending = true;
      currentFlushPromise = resolvedPromise.then(flushJobs);
    }
  }

  function queueCb(cb, activeQueue, pendingQueue, index) {
    if (!isArray$1(cb)) {
      if (!activeQueue || !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)) {
        pendingQueue.push(cb);
      }
    } else {
      // if cb is an array, it is a component lifecycle hook which can only be
      // triggered by a job, which is already deduped in the main queue, so
      // we can skip duplicate check here to improve perf
      pendingQueue.push(...cb);
    }

    queueFlush();
  }

  function queuePreFlushCb(cb) {
    queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex);
  }

  function queuePostFlushCb(cb) {
    queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
  }

  function flushPreFlushCbs(seen, parentJob = null) {
    if (pendingPreFlushCbs.length) {
      currentPreFlushParentJob = parentJob;
      activePreFlushCbs = [...new Set(pendingPreFlushCbs)];
      pendingPreFlushCbs.length = 0;

      if (process.env.NODE_ENV !== 'production') {
        seen = seen || new Map();
      }

      for (preFlushIndex = 0; preFlushIndex < activePreFlushCbs.length; preFlushIndex++) {
        if (process.env.NODE_ENV !== 'production') {
          checkRecursiveUpdates(seen, activePreFlushCbs[preFlushIndex]);
        }

        activePreFlushCbs[preFlushIndex]();
      }

      activePreFlushCbs = null;
      preFlushIndex = 0;
      currentPreFlushParentJob = null; // recursively flush until it drains

      flushPreFlushCbs(seen, parentJob);
    }
  }

  function flushPostFlushCbs(seen) {
    if (pendingPostFlushCbs.length) {
      const deduped = [...new Set(pendingPostFlushCbs)];
      pendingPostFlushCbs.length = 0; // #1947 already has active queue, nested flushPostFlushCbs call

      if (activePostFlushCbs) {
        activePostFlushCbs.push(...deduped);
        return;
      }

      activePostFlushCbs = deduped;

      if (process.env.NODE_ENV !== 'production') {
        seen = seen || new Map();
      }

      activePostFlushCbs.sort((a, b) => getId(a) - getId(b));

      for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
        if (process.env.NODE_ENV !== 'production') {
          checkRecursiveUpdates(seen, activePostFlushCbs[postFlushIndex]);
        }

        activePostFlushCbs[postFlushIndex]();
      }

      activePostFlushCbs = null;
      postFlushIndex = 0;
    }
  }

  const getId = job => job.id == null ? Infinity : job.id;

  function flushJobs(seen) {
    isFlushPending = false;
    isFlushing = true;

    if (process.env.NODE_ENV !== 'production') {
      seen = seen || new Map();
    }

    flushPreFlushCbs(seen); // Sort queue before flush.
    // This ensures that:
    // 1. Components are updated from parent to child. (because parent is always
    //    created before the child so its render effect will have smaller
    //    priority number)
    // 2. If a component is unmounted during a parent component's update,
    //    its update can be skipped.
    // Jobs can never be null before flush starts, since they are only invalidated
    // during execution of another flushed job.

    queue.sort((a, b) => getId(a) - getId(b));

    try {
      for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
        const job = queue[flushIndex];

        if (job) {
          if (process.env.NODE_ENV !== 'production') {
            checkRecursiveUpdates(seen, job);
          }

          callWithErrorHandling(job, null, 14
          /* SCHEDULER */
          );
        }
      }
    } finally {
      flushIndex = 0;
      queue.length = 0;
      flushPostFlushCbs(seen);
      isFlushing = false;
      currentFlushPromise = null; // some postFlushCb queued jobs!
      // keep flushing until it drains.

      if (queue.length || pendingPostFlushCbs.length) {
        flushJobs(seen);
      }
    }
  }

  function checkRecursiveUpdates(seen, fn) {
    if (!seen.has(fn)) {
      seen.set(fn, 1);
    } else {
      const count = seen.get(fn);

      if (count > RECURSION_LIMIT) {
        throw new Error(`Maximum recursive updates exceeded. ` + `This means you have a reactive effect that is mutating its own ` + `dependencies and thus recursively triggering itself. Possible sources ` + `include component template, render function, updated hook or ` + `watcher source function.`);
      } else {
        seen.set(fn, count + 1);
      }
    }
  }
  const hmrDirtyComponents = new Set(); // Expose the HMR runtime on the global object
  // This makes it entirely tree-shakable without polluting the exports and makes
  // it easier to be used in toolings like vue-loader
  // Note: for a component to be eligible for HMR it also needs the __hmrId option
  // to be set so that its instances can be registered / removed.

  if (process.env.NODE_ENV !== 'production') {
    const globalObject = typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : {};
    globalObject.__VUE_HMR_RUNTIME__ = {
      createRecord: tryWrap(createRecord),
      rerender: tryWrap(rerender),
      reload: tryWrap(reload)
    };
  }

  const map = new Map();

  function createRecord(id) {
    if (map.has(id)) {
      return false;
    }

    map.set(id, new Set());
    return true;
  }

  function rerender(id, newRender) {
    const record = map.get(id);
    if (!record) return; // Array.from creates a snapshot which avoids the set being mutated during
    // updates

    Array.from(record).forEach(instance => {
      if (newRender) {
        instance.render = newRender;
      }

      instance.renderCache = []; // this flag forces child components with slot content to update
      instance.update();
    });
  }

  function reload(id, newComp) {
    const record = map.get(id);
    if (!record) return; // Array.from creates a snapshot which avoids the set being mutated during
    // updates

    Array.from(record).forEach(instance => {
      const comp = instance.type;

      if (!hmrDirtyComponents.has(comp)) {
        // 1. Update existing comp definition to match new one
        extend$1(comp, newComp);

        for (const key in comp) {
          if (!(key in newComp)) {
            delete comp[key];
          }
        } // 2. Mark component dirty. This forces the renderer to replace the component
        // on patch.


        hmrDirtyComponents.add(comp); // 3. Make sure to unmark the component after the reload.

        queuePostFlushCb(() => {
          hmrDirtyComponents.delete(comp);
        });
      }

      if (instance.parent) {
        // 4. Force the parent instance to re-render. This will cause all updated
        // components to be unmounted and re-mounted. Queue the update so that we
        // don't end up forcing the same parent to re-render multiple times.
        queueJob(instance.parent.update);
      } else if (instance.appContext.reload) {
        // root instance mounted via createApp() has a reload method
        instance.appContext.reload();
      } else if (typeof window !== 'undefined') {
        // root instance inside tree created via raw render(). Force reload.
        window.location.reload();
      } else {
        console.warn('[HMR] Root or manually mounted instance modified. Full reload required.');
      }
    });
  }

  function tryWrap(fn) {
    return (id, arg) => {
      try {
        return fn(id, arg);
      } catch (e) {
        console.error(e);
        console.warn(`[HMR] Something went wrong during Vue component hot-reload. ` + `Full reload required.`);
      }
    };
  } // mark the current rendering instance for asset resolution (e.g.
  // resolveComponent, resolveDirective) during render


  let currentRenderingInstance = null;

  function setCurrentRenderingInstance(instance) {
    currentRenderingInstance = instance;
  } // dev only flag to track whether $attrs was used during render.

  function markAttrsAccessed() {
  }

  const isSuspense = type => type.__isSuspense; // Suspense exposes a component-like API, and is treated like a component

  function queueEffectWithSuspense(fn, suspense) {
    if (suspense && !suspense.isResolved) {
      if (isArray$1(fn)) {
        suspense.effects.push(...fn);
      } else {
        suspense.effects.push(fn);
      }
    } else {
      queuePostFlushCb(fn);
    }
  }

  let isRenderingCompiledSlot = 0;

  const setCompiledSlotRendering = n => isRenderingCompiledSlot += n;
  /**
   * Wrap a slot function to memoize current rendering instance
   * @private
   */


  function withCtx(fn, ctx = currentRenderingInstance) {
    if (!ctx) return fn;

    const renderFnWithContext = (...args) => {
      // If a user calls a compiled slot inside a template expression (#1745), it
      // can mess up block tracking, so by default we need to push a null block to
      // avoid that. This isn't necessary if rendering a compiled `<slot>`.
      if (!isRenderingCompiledSlot) {
        openBlock(true
        /* null block that disables tracking */
        );
      }

      const owner = currentRenderingInstance;
      setCurrentRenderingInstance(ctx);
      const res = fn(...args);
      setCurrentRenderingInstance(owner);

      if (!isRenderingCompiledSlot) {
        closeBlock();
      }

      return res;
    };

    renderFnWithContext._c = true;
    return renderFnWithContext;
  } // SFC scoped style ID management.


  let currentScopeId = null;
  const scopeIdStack = [];
  /**
   * @private
   */

  function pushScopeId(id) {
    scopeIdStack.push(currentScopeId = id);
  }
  /**
   * @private
   */


  function popScopeId() {
    scopeIdStack.pop();
    currentScopeId = scopeIdStack[scopeIdStack.length - 1] || null;
  }
  /**
   * @private
   */


  function withScopeId(id) {
    return fn => withCtx(function () {
      pushScopeId(id);
      const res = fn.apply(this, arguments);
      popScopeId();
      return res;
    });
  }

  const isTeleport = type => type.__isTeleport;
  const COMPONENTS = 'components';
  /**
   * @private
   */

  function resolveComponent(name) {
    return resolveAsset(COMPONENTS, name) || name;
  }

  const NULL_DYNAMIC_COMPONENT = Symbol();


  function resolveAsset(type, name, warnMissing = true) {
    const instance = currentRenderingInstance || currentInstance;

    if (instance) {
      const Component = instance.type; // self name has highest priority

      if (type === COMPONENTS) {
        const selfName = Component.displayName || Component.name;

        if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize$1(camelize(name)))) {
          return Component;
        }
      }

      const res = // local registration
      // check instance[type] first for components with mixin or extends.
      resolve(instance[type] || Component[type], name) || // global registration
      resolve(instance.appContext[type], name);

      if (process.env.NODE_ENV !== 'production' && warnMissing && !res) {
        warn(`Failed to resolve ${type.slice(0, -1)}: ${name}`);
      }

      return res;
    } else if (process.env.NODE_ENV !== 'production') {
      warn(`resolve${capitalize$1(type.slice(0, -1))} ` + `can only be used in render() or setup().`);
    }
  }

  function resolve(registry, name) {
    return registry && (registry[name] || registry[camelize(name)] || registry[capitalize$1(camelize(name))]);
  }

  const Fragment = Symbol(process.env.NODE_ENV !== 'production' ? 'Fragment' : undefined);
  const Text = Symbol(process.env.NODE_ENV !== 'production' ? 'Text' : undefined);
  const Comment = Symbol(process.env.NODE_ENV !== 'production' ? 'Comment' : undefined);
  const Static = Symbol(process.env.NODE_ENV !== 'production' ? 'Static' : undefined); // Since v-if and v-for are the two possible ways node structure can dynamically
  // change, once we consider v-if branches and each v-for fragment a block, we
  // can divide a template into nested blocks, and within each block the node
  // structure would be stable. This allows us to skip most children diffing
  // and only worry about the dynamic nodes (indicated by patch flags).

  const blockStack = [];
  let currentBlock = null;
  /**
   * Open a block.
   * This must be called before `createBlock`. It cannot be part of `createBlock`
   * because the children of the block are evaluated before `createBlock` itself
   * is called. The generated code typically looks like this:
   *
   * ```js
   * function render() {
   *   return (openBlock(),createBlock('div', null, [...]))
   * }
   * ```
   * disableTracking is true when creating a v-for fragment block, since a v-for
   * fragment always diffs its children.
   *
   * @private
   */

  function openBlock(disableTracking = false) {
    blockStack.push(currentBlock = disableTracking ? null : []);
  }

  function closeBlock() {
    blockStack.pop();
    currentBlock = blockStack[blockStack.length - 1] || null;
  } // Whether we should be tracking dynamic child nodes inside a block.
  /**
   * Create a block root vnode. Takes the same exact arguments as `createVNode`.
   * A block root keeps track of dynamic nodes within the block in the
   * `dynamicChildren` array.
   *
   * @private
   */


  function createBlock(type, props, children, patchFlag, dynamicProps) {
    const vnode = createVNode(type, props, children, patchFlag, dynamicProps, true
    /* isBlock: prevent a block from tracking itself */
    ); // save current block children on the block vnode

    vnode.dynamicChildren = currentBlock || EMPTY_ARR; // close block

    closeBlock(); // a block is always going to be patched, so track it as a child of its
    // parent block

    if ( currentBlock) {
      currentBlock.push(vnode);
    }

    return vnode;
  }

  function isVNode(value) {
    return value ? value.__v_isVNode === true : false;
  }

  const createVNodeWithArgsTransform = (...args) => {
    return _createVNode(...( args));
  };

  const InternalObjectKey = `__vInternal`;

  const normalizeKey = ({
    key
  }) => key != null ? key : null;

  const normalizeRef = ({
    ref
  }) => {
    return ref != null ? isArray$1(ref) ? ref : [currentRenderingInstance, ref] : null;
  };

  const createVNode = process.env.NODE_ENV !== 'production' ? createVNodeWithArgsTransform : _createVNode;

  function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
    if (!type || type === NULL_DYNAMIC_COMPONENT) {
      if (process.env.NODE_ENV !== 'production' && !type) {
        warn(`Invalid vnode type when creating vnode: ${type}.`);
      }

      type = Comment;
    }

    if (isVNode(type)) {
      const cloned = cloneVNode(type, props);

      if (children) {
        normalizeChildren(cloned, children);
      }

      return cloned;
    } // class component normalization.


    if (isFunction(type) && '__vccOpts' in type) {
      type = type.__vccOpts;
    } // class & style normalization.


    if (props) {
      // for reactive or proxy objects, we need to clone it to enable mutation.
      if (isProxy(props) || InternalObjectKey in props) {
        props = extend$1({}, props);
      }

      let {
        class: klass,
        style
      } = props;

      if (klass && !isString$1(klass)) {
        props.class = normalizeClass(klass);
      }

      if (isObject$1(style)) {
        // reactive state objects need to be cloned since they are likely to be
        // mutated
        if (isProxy(style) && !isArray$1(style)) {
          style = extend$1({}, style);
        }

        props.style = normalizeStyle(style);
      }
    } // encode the vnode type information into a bitmap


    const shapeFlag = isString$1(type) ? 1
    /* ELEMENT */
    : isSuspense(type) ? 128
    /* SUSPENSE */
    : isTeleport(type) ? 64
    /* TELEPORT */
    : isObject$1(type) ? 4
    /* STATEFUL_COMPONENT */
    : isFunction(type) ? 2
    /* FUNCTIONAL_COMPONENT */
    : 0;

    if (process.env.NODE_ENV !== 'production' && shapeFlag & 4
    /* STATEFUL_COMPONENT */
    && isProxy(type)) {
      type = toRaw(type);
      warn(`Vue received a Component which was made a reactive object. This can ` + `lead to unnecessary performance overhead, and should be avoided by ` + `marking the component with \`markRaw\` or using \`shallowRef\` ` + `instead of \`ref\`.`, `\nComponent that was made reactive: `, type);
    }

    const vnode = {
      __v_isVNode: true,
      ["__v_skip"
      /* SKIP */
      ]: true,
      type,
      props,
      key: props && normalizeKey(props),
      ref: props && normalizeRef(props),
      scopeId: currentScopeId,
      children: null,
      component: null,
      suspense: null,
      dirs: null,
      transition: null,
      el: null,
      anchor: null,
      target: null,
      targetAnchor: null,
      staticCount: 0,
      shapeFlag,
      patchFlag,
      dynamicProps,
      dynamicChildren: null,
      appContext: null
    }; // validate key

    if (process.env.NODE_ENV !== 'production' && vnode.key !== vnode.key) {
      warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type);
    }

    normalizeChildren(vnode, children);

    if ( // avoid a block node from tracking itself
    !isBlockNode && // has current parent block
    currentBlock && ( // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    patchFlag > 0 || shapeFlag & 6
    /* COMPONENT */
    ) && // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    patchFlag !== 32
    /* HYDRATE_EVENTS */
    ) {
        currentBlock.push(vnode);
      }

    return vnode;
  }

  function cloneVNode(vnode, extraProps) {
    // This is intentionally NOT using spread or extend to avoid the runtime
    // key enumeration cost.
    const {
      props,
      patchFlag
    } = vnode;
    const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
    return {
      __v_isVNode: true,
      ["__v_skip"
      /* SKIP */
      ]: true,
      type: vnode.type,
      props: mergedProps,
      key: mergedProps && normalizeKey(mergedProps),
      ref: extraProps && extraProps.ref ? normalizeRef(extraProps) : vnode.ref,
      scopeId: vnode.scopeId,
      children: vnode.children,
      target: vnode.target,
      targetAnchor: vnode.targetAnchor,
      staticCount: vnode.staticCount,
      shapeFlag: vnode.shapeFlag,
      // if the vnode is cloned with extra props, we can no longer assume its
      // existing patch flag to be reliable and need to add the FULL_PROPS flag.
      // note: perserve flag for fragments since they use the flag for children
      // fast paths only.
      patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 // hoisted node
      ? 16
      /* FULL_PROPS */
      : patchFlag | 16
      /* FULL_PROPS */
      : patchFlag,
      dynamicProps: vnode.dynamicProps,
      dynamicChildren: vnode.dynamicChildren,
      appContext: vnode.appContext,
      dirs: vnode.dirs,
      transition: vnode.transition,
      // These should technically only be non-null on mounted VNodes. However,
      // they *should* be copied for kept-alive vnodes. So we just always copy
      // them since them being non-null during a mount doesn't affect the logic as
      // they will simply be overwritten.
      component: vnode.component,
      suspense: vnode.suspense,
      el: vnode.el,
      anchor: vnode.anchor
    };
  }
  /**
   * @private
   */


  function createTextVNode(text = ' ', flag = 0) {
    return createVNode(Text, null, text, flag);
  }

  function normalizeChildren(vnode, children) {
    let type = 0;
    const {
      shapeFlag
    } = vnode;

    if (children == null) {
      children = null;
    } else if (isArray$1(children)) {
      type = 16
      /* ARRAY_CHILDREN */
      ;
    } else if (typeof children === 'object') {
      if (shapeFlag & 1
      /* ELEMENT */
      || shapeFlag & 64
      /* TELEPORT */
      ) {
          // Normalize slot to plain children for plain element and Teleport
          const slot = children.default;

          if (slot) {
            // _c marker is added by withCtx() indicating this is a compiled slot
            slot._c && setCompiledSlotRendering(1);
            normalizeChildren(vnode, slot());
            slot._c && setCompiledSlotRendering(-1);
          }

          return;
        } else {
        type = 32
        /* SLOTS_CHILDREN */
        ;
        const slotFlag = children._;

        if (!slotFlag && !(InternalObjectKey in children)) {
          children._ctx = currentRenderingInstance;
        } else if (slotFlag === 3
        /* FORWARDED */
        && currentRenderingInstance) {
          // a child component receives forwarded slots from the parent.
          // its slot type is determined by its parent's slot type.
          if (currentRenderingInstance.vnode.patchFlag & 1024
          /* DYNAMIC_SLOTS */
          ) {
              children._ = 2
              /* DYNAMIC */
              ;
              vnode.patchFlag |= 1024
              /* DYNAMIC_SLOTS */
              ;
            } else {
            children._ = 1
            /* STABLE */
            ;
          }
        }
      }
    } else if (isFunction(children)) {
      children = {
        default: children,
        _ctx: currentRenderingInstance
      };
      type = 32
      /* SLOTS_CHILDREN */
      ;
    } else {
      children = String(children); // force teleport children to array so it can be moved around

      if (shapeFlag & 64
      /* TELEPORT */
      ) {
          type = 16
          /* ARRAY_CHILDREN */
          ;
          children = [createTextVNode(children)];
        } else {
        type = 8
        /* TEXT_CHILDREN */
        ;
      }
    }

    vnode.children = children;
    vnode.shapeFlag |= type;
  }

  function mergeProps(...args) {
    const ret = extend$1({}, args[0]);

    for (let i = 1; i < args.length; i++) {
      const toMerge = args[i];

      for (const key in toMerge) {
        if (key === 'class') {
          if (ret.class !== toMerge.class) {
            ret.class = normalizeClass([ret.class, toMerge.class]);
          }
        } else if (key === 'style') {
          ret.style = normalizeStyle([ret.style, toMerge.style]);
        } else if (isOn(key)) {
          const existing = ret[key];
          const incoming = toMerge[key];

          if (existing !== incoming) {
            ret[key] = existing ? [].concat(existing, toMerge[key]) : incoming;
          }
        } else {
          ret[key] = toMerge[key];
        }
      }
    }

    return ret;
  }

  function setDevtoolsHook(hook) {
  }

  const queuePostRenderEffect = queueEffectWithSuspense;


  const INITIAL_WATCHER_VALUE = {}; // implementation

  function doWatch(source, cb, {
    immediate,
    deep,
    flush,
    onTrack,
    onTrigger
  } = EMPTY_OBJ$1, instance = currentInstance) {
    if (process.env.NODE_ENV !== 'production' && !cb) {
      if (immediate !== undefined) {
        warn(`watch() "immediate" option is only respected when using the ` + `watch(source, callback, options?) signature.`);
      }

      if (deep !== undefined) {
        warn(`watch() "deep" option is only respected when using the ` + `watch(source, callback, options?) signature.`);
      }
    }

    const warnInvalidSource = s => {
      warn(`Invalid watch source: `, s, `A watch source can only be a getter/effect function, a ref, ` + `a reactive object, or an array of these types.`);
    };

    let getter;
    const isRefSource = isRef(source);

    if (isRefSource) {
      getter = () => source.value;
    } else if (isReactive(source)) {
      getter = () => source;

      deep = true;
    } else if (isArray$1(source)) {
      getter = () => source.map(s => {
        if (isRef(s)) {
          return s.value;
        } else if (isReactive(s)) {
          return traverse(s);
        } else if (isFunction(s)) {
          return callWithErrorHandling(s, instance, 2
          /* WATCH_GETTER */
          );
        } else {
          process.env.NODE_ENV !== 'production' && warnInvalidSource(s);
        }
      });
    } else if (isFunction(source)) {
      if (cb) {
        // getter with cb
        getter = () => callWithErrorHandling(source, instance, 2
        /* WATCH_GETTER */
        );
      } else {
        // no cb -> simple effect
        getter = () => {
          if (instance && instance.isUnmounted) {
            return;
          }

          if (cleanup) {
            cleanup();
          }

          return callWithErrorHandling(source, instance, 3
          /* WATCH_CALLBACK */
          , [onInvalidate]);
        };
      }
    } else {
      getter = NOOP;
      process.env.NODE_ENV !== 'production' && warnInvalidSource(source);
    }

    if (cb && deep) {
      const baseGetter = getter;

      getter = () => traverse(baseGetter());
    }

    let cleanup;

    const onInvalidate = fn => {
      cleanup = runner.options.onStop = () => {
        callWithErrorHandling(fn, instance, 4
        /* WATCH_CLEANUP */
        );
      };
    };

    let oldValue = isArray$1(source) ? [] : INITIAL_WATCHER_VALUE;

    const job = () => {
      if (!runner.active) {
        return;
      }

      if (cb) {
        // watch(source, cb)
        const newValue = runner();

        if (deep || isRefSource || hasChanged$1(newValue, oldValue)) {
          // cleanup before running cb again
          if (cleanup) {
            cleanup();
          }

          callWithAsyncErrorHandling(cb, instance, 3
          /* WATCH_CALLBACK */
          , [newValue, // pass undefined as the old value when it's changed for the first time
          oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue, onInvalidate]);
          oldValue = newValue;
        }
      } else {
        // watchEffect
        runner();
      }
    }; // important: mark the job as a watcher callback so that scheduler knows it
    // it is allowed to self-trigger (#1727)


    job.allowRecurse = !!cb;
    let scheduler;

    if (flush === 'sync') {
      scheduler = job;
    } else if (flush === 'pre') {
      // ensure it's queued before component updates (which have positive ids)
      job.id = -1;

      scheduler = () => {
        if (!instance || instance.isMounted) {
          queuePreFlushCb(job);
        } else {
          // with 'pre' option, the first call must happen before
          // the component is mounted so it is called synchronously.
          job();
        }
      };
    } else {
      scheduler = () => queuePostRenderEffect(job, instance && instance.suspense);
    }

    const runner = effect(getter, {
      lazy: true,
      onTrack,
      onTrigger,
      scheduler
    });

    if (cb) {
      if (immediate) {
        job();
      } else {
        oldValue = runner();
      }
    } else {
      runner();
    }

    return () => {
      stop(runner);

      if (instance) {
        remove(instance.effects, runner);
      }
    };
  } // this.$watch


  function instanceWatch(source, cb, options) {
    const publicThis = this.proxy;
    const getter = isString$1(source) ? () => publicThis[source] : source.bind(publicThis);
    return doWatch(getter, cb.bind(publicThis), options, this);
  }

  function traverse(value, seen = new Set()) {
    if (!isObject$1(value) || seen.has(value)) {
      return value;
    }

    seen.add(value);

    if (isRef(value)) {
      traverse(value.value, seen);
    } else if (isArray$1(value)) {
      for (let i = 0; i < value.length; i++) {
        traverse(value[i], seen);
      }
    } else if (value instanceof Map) {
      value.forEach((v, key) => {
        // to register mutation dep for existing keys
        traverse(value.get(key), seen);
      });
    } else if (value instanceof Set) {
      value.forEach(v => {
        traverse(v, seen);
      });
    } else {
      for (const key in value) {
        traverse(value[key], seen);
      }
    }

    return value;
  }

  let isInBeforeCreate = false;

  function resolveMergedOptions(instance) {
    const raw = instance.type;
    const {
      __merged,
      mixins,
      extends: extendsOptions
    } = raw;
    if (__merged) return __merged;
    const globalMixins = instance.appContext.mixins;
    if (!globalMixins.length && !mixins && !extendsOptions) return raw;
    const options = {};
    mergeOptions(options, raw, instance);
    globalMixins.forEach(m => mergeOptions(options, m, instance));
    return raw.__merged = options;
  }

  function mergeOptions(to, from, instance) {
    const strats = instance.appContext.config.optionMergeStrategies;

    for (const key in from) {
      if (strats && hasOwn$1(strats, key)) {
        to[key] = strats[key](to[key], from[key], instance.proxy, key);
      } else if (!hasOwn$1(to, key)) {
        to[key] = from[key];
      }
    }

    const {
      mixins,
      extends: extendsOptions
    } = from;
    extendsOptions && mergeOptions(to, extendsOptions, instance);
    mixins && mixins.forEach(m => mergeOptions(to, m, instance));
  }

  const publicPropertiesMap = extend$1(Object.create(null), {
    $: i => i,
    $el: i => i.vnode.el,
    $data: i => i.data,
    $props: i => process.env.NODE_ENV !== 'production' ? shallowReadonly(i.props) : i.props,
    $attrs: i => process.env.NODE_ENV !== 'production' ? shallowReadonly(i.attrs) : i.attrs,
    $slots: i => process.env.NODE_ENV !== 'production' ? shallowReadonly(i.slots) : i.slots,
    $refs: i => process.env.NODE_ENV !== 'production' ? shallowReadonly(i.refs) : i.refs,
    $parent: i => i.parent && i.parent.proxy,
    $root: i => i.root && i.root.proxy,
    $emit: i => i.emit,
    $options: i => __VUE_OPTIONS_API__ ? resolveMergedOptions(i) : i.type,
    $forceUpdate: i => () => queueJob(i.update),
    $nextTick: () => nextTick,
    $watch: i => __VUE_OPTIONS_API__ ? instanceWatch.bind(i) : NOOP
  });
  const PublicInstanceProxyHandlers = {
    get({
      _: instance
    }, key) {
      const {
        ctx,
        setupState,
        data,
        props,
        accessCache,
        type,
        appContext
      } = instance; // let @vue/reactivity know it should never observe Vue public instances.

      if (key === "__v_skip"
      /* SKIP */
      ) {
          return true;
        } // data / props / ctx
      // This getter gets called for every property access on the render context
      // during render and is a major hotspot. The most expensive part of this
      // is the multiple hasOwn() calls. It's much faster to do a simple property
      // access on a plain object, so we use an accessCache object (with null
      // prototype) to memoize what access type a key corresponds to.


      let normalizedProps;

      if (key[0] !== '$') {
        const n = accessCache[key];

        if (n !== undefined) {
          switch (n) {
            case 0
            /* SETUP */
            :
              return setupState[key];

            case 1
            /* DATA */
            :
              return data[key];

            case 3
            /* CONTEXT */
            :
              return ctx[key];

            case 2
            /* PROPS */
            :
              return props[key];
            // default: just fallthrough
          }
        } else if (setupState !== EMPTY_OBJ$1 && hasOwn$1(setupState, key)) {
          accessCache[key] = 0
          /* SETUP */
          ;
          return setupState[key];
        } else if (data !== EMPTY_OBJ$1 && hasOwn$1(data, key)) {
          accessCache[key] = 1
          /* DATA */
          ;
          return data[key];
        } else if ( // only cache other properties when instance has declared (thus stable)
        // props
        (normalizedProps = instance.propsOptions[0]) && hasOwn$1(normalizedProps, key)) {
          accessCache[key] = 2
          /* PROPS */
          ;
          return props[key];
        } else if (ctx !== EMPTY_OBJ$1 && hasOwn$1(ctx, key)) {
          accessCache[key] = 3
          /* CONTEXT */
          ;
          return ctx[key];
        } else if (!__VUE_OPTIONS_API__ || !isInBeforeCreate) {
          accessCache[key] = 4
          /* OTHER */
          ;
        }
      }

      const publicGetter = publicPropertiesMap[key];
      let cssModule, globalProperties; // public $xxx properties

      if (publicGetter) {
        if (key === '$attrs') {
          track(instance, "get"
          /* GET */
          , key);
          process.env.NODE_ENV !== 'production' && markAttrsAccessed();
        }

        return publicGetter(instance);
      } else if ( // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])) {
        return cssModule;
      } else if (ctx !== EMPTY_OBJ$1 && hasOwn$1(ctx, key)) {
        // user may set custom properties to `this` that start with `$`
        accessCache[key] = 3
        /* CONTEXT */
        ;
        return ctx[key];
      } else if ( // global properties
      globalProperties = appContext.config.globalProperties, hasOwn$1(globalProperties, key)) {
        return globalProperties[key];
      } else if (process.env.NODE_ENV !== 'production' && currentRenderingInstance && (!isString$1(key) || // #1091 avoid internal isRef/isVNode checks on component instance leading
      // to infinite warning loop
      key.indexOf('__v') !== 0)) {
        if (data !== EMPTY_OBJ$1 && key[0] === '$' && hasOwn$1(data, key)) {
          warn(`Property ${JSON.stringify(key)} must be accessed via $data because it starts with a reserved ` + `character and is not proxied on the render context.`);
        } else {
          warn(`Property ${JSON.stringify(key)} was accessed during render ` + `but is not defined on instance.`);
        }
      }
    },

    set({
      _: instance
    }, key, value) {
      const {
        data,
        setupState,
        ctx
      } = instance;

      if (setupState !== EMPTY_OBJ$1 && hasOwn$1(setupState, key)) {
        setupState[key] = value;
      } else if (data !== EMPTY_OBJ$1 && hasOwn$1(data, key)) {
        data[key] = value;
      } else if (key in instance.props) {
        process.env.NODE_ENV !== 'production' && warn(`Attempting to mutate prop "${key}". Props are readonly.`, instance);
        return false;
      }

      if (key[0] === '$' && key.slice(1) in instance) {
        process.env.NODE_ENV !== 'production' && warn(`Attempting to mutate public property "${key}". ` + `Properties starting with $ are reserved and readonly.`, instance);
        return false;
      } else {
        if (process.env.NODE_ENV !== 'production' && key in instance.appContext.config.globalProperties) {
          Object.defineProperty(ctx, key, {
            enumerable: true,
            configurable: true,
            value
          });
        } else {
          ctx[key] = value;
        }
      }

      return true;
    },

    has({
      _: {
        data,
        setupState,
        accessCache,
        ctx,
        appContext,
        propsOptions
      }
    }, key) {
      let normalizedProps;
      return accessCache[key] !== undefined || data !== EMPTY_OBJ$1 && hasOwn$1(data, key) || setupState !== EMPTY_OBJ$1 && hasOwn$1(setupState, key) || (normalizedProps = propsOptions[0]) && hasOwn$1(normalizedProps, key) || hasOwn$1(ctx, key) || hasOwn$1(publicPropertiesMap, key) || hasOwn$1(appContext.config.globalProperties, key);
    }

  };

  if (process.env.NODE_ENV !== 'production' && !false) {
    PublicInstanceProxyHandlers.ownKeys = target => {
      warn(`Avoid app logic that relies on enumerating keys on a component instance. ` + `The keys will be empty in production mode to avoid performance overhead.`);
      return Reflect.ownKeys(target);
    };
  }

  const RuntimeCompiledPublicInstanceProxyHandlers = extend$1({}, PublicInstanceProxyHandlers, {
    get(target, key) {
      // fast path for unscopables when using `with` block
      if (key === Symbol.unscopables) {
        return;
      }

      return PublicInstanceProxyHandlers.get(target, key, target);
    },

    has(_, key) {
      const has = key[0] !== '_' && !isGloballyWhitelisted(key);

      if (process.env.NODE_ENV !== 'production' && !has && PublicInstanceProxyHandlers.has(_, key)) {
        warn(`Property ${JSON.stringify(key)} should not start with _ which is a reserved prefix for Vue internals.`);
      }

      return has;
    }

  }); // In dev mode, the proxy target exposes the same properties as seen on `this`

  let currentInstance = null;

  const classifyRE = /(?:^|[-_])(\w)/g;

  const classify = str => str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '');
  /* istanbul ignore next */


  function formatComponentName(instance, Component, isRoot = false) {
    let name = isFunction(Component) ? Component.displayName || Component.name : Component.name;

    if (!name && Component.__file) {
      const match = Component.__file.match(/([^/\\]+)\.vue$/);

      if (match) {
        name = match[1];
      }
    }

    if (!name && instance && instance.parent) {
      // try to infer the name based on reverse resolution
      const inferFromRegistry = registry => {
        for (const key in registry) {
          if (registry[key] === Component) {
            return key;
          }
        }
      };

      name = inferFromRegistry(instance.components || instance.parent.type.components) || inferFromRegistry(instance.appContext.components);
    }

    return name ? classify(name) : isRoot ? `App` : `Anonymous`;
  }

  const ssrContextKey = Symbol(process.env.NODE_ENV !== 'production' ? `ssrContext` : ``);

  /**
   * Make a map and return a function for checking if a key
   * is in that map.
   * IMPORTANT: all calls of this function must be prefixed with
   * \/\*#\_\_PURE\_\_\*\/
   * So that rollup can tree-shake them if necessary.
   */
  const EMPTY_OBJ$2 = process.env.NODE_ENV !== 'production' ? Object.freeze({}) : {};

  let _globalThis;

  const getGlobalThis = () => {
    return _globalThis || (_globalThis = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {});
  };

  function initDev() {
    const target = getGlobalThis();
    target.__VUE__ = true;
    setDevtoolsHook(target.__VUE_DEVTOOLS_GLOBAL_HOOK__);
    {
      console.info(`You are running a development build of Vue.\n` + `Make sure to use the production build (*.prod.js) when deploying for production.`);
    }
  } // This entry exports the runtime only, and is built as


  process.env.NODE_ENV !== 'production' && initDev();

  const _withId = /*#__PURE__*/withScopeId("data-v-4ab1f822");

  pushScopeId("data-v-4ab1f822");
  const _hoisted_1 = { class: "hello" };
  const _hoisted_2 = /*#__PURE__*/createVNode("h3", null, "A new chapter.", -1 /* HOISTED */);
  popScopeId();

  const render = /*#__PURE__*/_withId(function render(_ctx, _cache, $props, $setup, $data, $options) {
    return (openBlock(), createBlock("div", _hoisted_1, [
      createVNode("h1", null, toDisplayString($props.msg), 1 /* TEXT */),
      _hoisted_2
    ]))
  });

  script.render = render;
  script.__scopeId = "data-v-4ab1f822";
  script.__file = "pages/home/components/HelloWorld.vue";

  var script$1 = {
    name: "App",
    components: {
      HelloWorld: script
    },

    created() {
      console.log("HomePage created");
    },

    mounted() {
      console.log("HomePage mounted");
    }

  };

  const _withId$1 = /*#__PURE__*/withScopeId("data-v-00da69ca");

  pushScopeId("data-v-00da69ca");
  const _hoisted_1$1 = /*#__PURE__*/createVNode("p", null, "Component render start", -1 /* HOISTED */);
  const _hoisted_2$1 = /*#__PURE__*/createVNode("p", null, "Component render end", -1 /* HOISTED */);
  popScopeId();

  const render$1 = /*#__PURE__*/_withId$1(function render(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_HelloWorld = resolveComponent("HelloWorld");

    return (openBlock(), createBlock("div", null, [
      _hoisted_1$1,
      createVNode(_component_HelloWorld, { msg: "Hello Vue in Fenice!" }),
      _hoisted_2$1
    ]))
  });

  script$1.render = render$1;
  script$1.__scopeId = "data-v-00da69ca";
  script$1.__file = "pages/home/App.vue";

  return script$1;

})));
