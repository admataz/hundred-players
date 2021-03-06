
(function(l, r) { if (l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (window.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.head.appendChild(r) })(window.document);
var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    let running = false;
    function run_tasks() {
        tasks.forEach(task => {
            if (!task[0](now())) {
                tasks.delete(task);
                task[1]();
            }
        });
        running = tasks.size > 0;
        if (running)
            raf(run_tasks);
    }
    function loop(fn) {
        let task;
        if (!running) {
            running = true;
            raf(run_tasks);
        }
        return {
            promise: new Promise(fulfil => {
                tasks.add(task = [fn, fulfil]);
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let stylesheet;
    let active = 0;
    let current_rules = {};
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        if (!current_rules[name]) {
            if (!stylesheet) {
                const style = element('style');
                document.head.appendChild(style);
                stylesheet = style.sheet;
            }
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        node.style.animation = (node.style.animation || '')
            .split(', ')
            .filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        )
            .join(', ');
        if (name && !--active)
            clear_rules();
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            let i = stylesheet.cssRules.length;
            while (i--)
                stylesheet.deleteRule(i);
            current_rules = {};
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update($$.dirty);
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.dirty, $$.ctx);
            $$.dirty = null;
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    const globals = (typeof window !== 'undefined' ? window : global);

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = {};
        }
    }
    function make_dirty(component, key) {
        if (!component.$$.dirty) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty = blank_object();
        }
        component.$$.dirty[key] = true;
    }
    function init(component, options, instance, create_fragment, not_equal, props) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty: null
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (key, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[key], $$.ctx[key] = value)) {
                    if ($$.bound[key])
                        $$.bound[key](value);
                    if (ready)
                        make_dirty(component, key);
                }
                return ret;
            })
            : prop_values;
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, detail));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    function unwrapExports (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var pusher = createCommonjsModule(function (module, exports) {
    /*!
     * Pusher JavaScript Library v5.0.2
     * https://pusher.com/
     *
     * Copyright 2017, Pusher
     * Released under the MIT licence.
     */

    (function webpackUniversalModuleDefinition(root, factory) {
    	module.exports = factory();
    })(window, function() {
    return /******/ (function(modules) { // webpackBootstrap
    /******/ 	// The module cache
    /******/ 	var installedModules = {};
    /******/
    /******/ 	// The require function
    /******/ 	function __webpack_require__(moduleId) {
    /******/
    /******/ 		// Check if module is in cache
    /******/ 		if(installedModules[moduleId]) {
    /******/ 			return installedModules[moduleId].exports;
    /******/ 		}
    /******/ 		// Create a new module (and put it into the cache)
    /******/ 		var module = installedModules[moduleId] = {
    /******/ 			i: moduleId,
    /******/ 			l: false,
    /******/ 			exports: {}
    /******/ 		};
    /******/
    /******/ 		// Execute the module function
    /******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
    /******/
    /******/ 		// Flag the module as loaded
    /******/ 		module.l = true;
    /******/
    /******/ 		// Return the exports of the module
    /******/ 		return module.exports;
    /******/ 	}
    /******/
    /******/
    /******/ 	// expose the modules object (__webpack_modules__)
    /******/ 	__webpack_require__.m = modules;
    /******/
    /******/ 	// expose the module cache
    /******/ 	__webpack_require__.c = installedModules;
    /******/
    /******/ 	// define getter function for harmony exports
    /******/ 	__webpack_require__.d = function(exports, name, getter) {
    /******/ 		if(!__webpack_require__.o(exports, name)) {
    /******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
    /******/ 		}
    /******/ 	};
    /******/
    /******/ 	// define __esModule on exports
    /******/ 	__webpack_require__.r = function(exports) {
    /******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
    /******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    /******/ 		}
    /******/ 		Object.defineProperty(exports, '__esModule', { value: true });
    /******/ 	};
    /******/
    /******/ 	// create a fake namespace object
    /******/ 	// mode & 1: value is a module id, require it
    /******/ 	// mode & 2: merge all properties of value into the ns
    /******/ 	// mode & 4: return value when already ns object
    /******/ 	// mode & 8|1: behave like require
    /******/ 	__webpack_require__.t = function(value, mode) {
    /******/ 		if(mode & 1) value = __webpack_require__(value);
    /******/ 		if(mode & 8) return value;
    /******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
    /******/ 		var ns = Object.create(null);
    /******/ 		__webpack_require__.r(ns);
    /******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
    /******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
    /******/ 		return ns;
    /******/ 	};
    /******/
    /******/ 	// getDefaultExport function for compatibility with non-harmony modules
    /******/ 	__webpack_require__.n = function(module) {
    /******/ 		var getter = module && module.__esModule ?
    /******/ 			function getDefault() { return module['default']; } :
    /******/ 			function getModuleExports() { return module; };
    /******/ 		__webpack_require__.d(getter, 'a', getter);
    /******/ 		return getter;
    /******/ 	};
    /******/
    /******/ 	// Object.prototype.hasOwnProperty.call
    /******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
    /******/
    /******/ 	// __webpack_public_path__
    /******/ 	__webpack_require__.p = "";
    /******/
    /******/
    /******/ 	// Load entry module and return exports
    /******/ 	return __webpack_require__(__webpack_require__.s = 2);
    /******/ })
    /************************************************************************/
    /******/ ([
    /* 0 */
    /***/ (function(module, exports, __webpack_require__) {

    (function(nacl) {

    // Ported in 2014 by Dmitry Chestnykh and Devi Mandiri.
    // Public domain.
    //
    // Implementation derived from TweetNaCl version 20140427.
    // See for details: http://tweetnacl.cr.yp.to/

    var gf = function(init) {
      var i, r = new Float64Array(16);
      if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
      return r;
    };

    //  Pluggable, initialized in high-level API below.
    var randombytes = function(/* x, n */) { throw new Error('no PRNG'); };

    var _0 = new Uint8Array(16);
    var _9 = new Uint8Array(32); _9[0] = 9;

    var gf0 = gf(),
        gf1 = gf([1]),
        _121665 = gf([0xdb41, 1]),
        D = gf([0x78a3, 0x1359, 0x4dca, 0x75eb, 0xd8ab, 0x4141, 0x0a4d, 0x0070, 0xe898, 0x7779, 0x4079, 0x8cc7, 0xfe73, 0x2b6f, 0x6cee, 0x5203]),
        D2 = gf([0xf159, 0x26b2, 0x9b94, 0xebd6, 0xb156, 0x8283, 0x149a, 0x00e0, 0xd130, 0xeef3, 0x80f2, 0x198e, 0xfce7, 0x56df, 0xd9dc, 0x2406]),
        X = gf([0xd51a, 0x8f25, 0x2d60, 0xc956, 0xa7b2, 0x9525, 0xc760, 0x692c, 0xdc5c, 0xfdd6, 0xe231, 0xc0a4, 0x53fe, 0xcd6e, 0x36d3, 0x2169]),
        Y = gf([0x6658, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666, 0x6666]),
        I = gf([0xa0b0, 0x4a0e, 0x1b27, 0xc4ee, 0xe478, 0xad2f, 0x1806, 0x2f43, 0xd7a7, 0x3dfb, 0x0099, 0x2b4d, 0xdf0b, 0x4fc1, 0x2480, 0x2b83]);

    function ts64(x, i, h, l) {
      x[i]   = (h >> 24) & 0xff;
      x[i+1] = (h >> 16) & 0xff;
      x[i+2] = (h >>  8) & 0xff;
      x[i+3] = h & 0xff;
      x[i+4] = (l >> 24)  & 0xff;
      x[i+5] = (l >> 16)  & 0xff;
      x[i+6] = (l >>  8)  & 0xff;
      x[i+7] = l & 0xff;
    }

    function vn(x, xi, y, yi, n) {
      var i,d = 0;
      for (i = 0; i < n; i++) d |= x[xi+i]^y[yi+i];
      return (1 & ((d - 1) >>> 8)) - 1;
    }

    function crypto_verify_16(x, xi, y, yi) {
      return vn(x,xi,y,yi,16);
    }

    function crypto_verify_32(x, xi, y, yi) {
      return vn(x,xi,y,yi,32);
    }

    function core_salsa20(o, p, k, c) {
      var j0  = c[ 0] & 0xff | (c[ 1] & 0xff)<<8 | (c[ 2] & 0xff)<<16 | (c[ 3] & 0xff)<<24,
          j1  = k[ 0] & 0xff | (k[ 1] & 0xff)<<8 | (k[ 2] & 0xff)<<16 | (k[ 3] & 0xff)<<24,
          j2  = k[ 4] & 0xff | (k[ 5] & 0xff)<<8 | (k[ 6] & 0xff)<<16 | (k[ 7] & 0xff)<<24,
          j3  = k[ 8] & 0xff | (k[ 9] & 0xff)<<8 | (k[10] & 0xff)<<16 | (k[11] & 0xff)<<24,
          j4  = k[12] & 0xff | (k[13] & 0xff)<<8 | (k[14] & 0xff)<<16 | (k[15] & 0xff)<<24,
          j5  = c[ 4] & 0xff | (c[ 5] & 0xff)<<8 | (c[ 6] & 0xff)<<16 | (c[ 7] & 0xff)<<24,
          j6  = p[ 0] & 0xff | (p[ 1] & 0xff)<<8 | (p[ 2] & 0xff)<<16 | (p[ 3] & 0xff)<<24,
          j7  = p[ 4] & 0xff | (p[ 5] & 0xff)<<8 | (p[ 6] & 0xff)<<16 | (p[ 7] & 0xff)<<24,
          j8  = p[ 8] & 0xff | (p[ 9] & 0xff)<<8 | (p[10] & 0xff)<<16 | (p[11] & 0xff)<<24,
          j9  = p[12] & 0xff | (p[13] & 0xff)<<8 | (p[14] & 0xff)<<16 | (p[15] & 0xff)<<24,
          j10 = c[ 8] & 0xff | (c[ 9] & 0xff)<<8 | (c[10] & 0xff)<<16 | (c[11] & 0xff)<<24,
          j11 = k[16] & 0xff | (k[17] & 0xff)<<8 | (k[18] & 0xff)<<16 | (k[19] & 0xff)<<24,
          j12 = k[20] & 0xff | (k[21] & 0xff)<<8 | (k[22] & 0xff)<<16 | (k[23] & 0xff)<<24,
          j13 = k[24] & 0xff | (k[25] & 0xff)<<8 | (k[26] & 0xff)<<16 | (k[27] & 0xff)<<24,
          j14 = k[28] & 0xff | (k[29] & 0xff)<<8 | (k[30] & 0xff)<<16 | (k[31] & 0xff)<<24,
          j15 = c[12] & 0xff | (c[13] & 0xff)<<8 | (c[14] & 0xff)<<16 | (c[15] & 0xff)<<24;

      var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7,
          x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14,
          x15 = j15, u;

      for (var i = 0; i < 20; i += 2) {
        u = x0 + x12 | 0;
        x4 ^= u<<7 | u>>>(32-7);
        u = x4 + x0 | 0;
        x8 ^= u<<9 | u>>>(32-9);
        u = x8 + x4 | 0;
        x12 ^= u<<13 | u>>>(32-13);
        u = x12 + x8 | 0;
        x0 ^= u<<18 | u>>>(32-18);

        u = x5 + x1 | 0;
        x9 ^= u<<7 | u>>>(32-7);
        u = x9 + x5 | 0;
        x13 ^= u<<9 | u>>>(32-9);
        u = x13 + x9 | 0;
        x1 ^= u<<13 | u>>>(32-13);
        u = x1 + x13 | 0;
        x5 ^= u<<18 | u>>>(32-18);

        u = x10 + x6 | 0;
        x14 ^= u<<7 | u>>>(32-7);
        u = x14 + x10 | 0;
        x2 ^= u<<9 | u>>>(32-9);
        u = x2 + x14 | 0;
        x6 ^= u<<13 | u>>>(32-13);
        u = x6 + x2 | 0;
        x10 ^= u<<18 | u>>>(32-18);

        u = x15 + x11 | 0;
        x3 ^= u<<7 | u>>>(32-7);
        u = x3 + x15 | 0;
        x7 ^= u<<9 | u>>>(32-9);
        u = x7 + x3 | 0;
        x11 ^= u<<13 | u>>>(32-13);
        u = x11 + x7 | 0;
        x15 ^= u<<18 | u>>>(32-18);

        u = x0 + x3 | 0;
        x1 ^= u<<7 | u>>>(32-7);
        u = x1 + x0 | 0;
        x2 ^= u<<9 | u>>>(32-9);
        u = x2 + x1 | 0;
        x3 ^= u<<13 | u>>>(32-13);
        u = x3 + x2 | 0;
        x0 ^= u<<18 | u>>>(32-18);

        u = x5 + x4 | 0;
        x6 ^= u<<7 | u>>>(32-7);
        u = x6 + x5 | 0;
        x7 ^= u<<9 | u>>>(32-9);
        u = x7 + x6 | 0;
        x4 ^= u<<13 | u>>>(32-13);
        u = x4 + x7 | 0;
        x5 ^= u<<18 | u>>>(32-18);

        u = x10 + x9 | 0;
        x11 ^= u<<7 | u>>>(32-7);
        u = x11 + x10 | 0;
        x8 ^= u<<9 | u>>>(32-9);
        u = x8 + x11 | 0;
        x9 ^= u<<13 | u>>>(32-13);
        u = x9 + x8 | 0;
        x10 ^= u<<18 | u>>>(32-18);

        u = x15 + x14 | 0;
        x12 ^= u<<7 | u>>>(32-7);
        u = x12 + x15 | 0;
        x13 ^= u<<9 | u>>>(32-9);
        u = x13 + x12 | 0;
        x14 ^= u<<13 | u>>>(32-13);
        u = x14 + x13 | 0;
        x15 ^= u<<18 | u>>>(32-18);
      }
       x0 =  x0 +  j0 | 0;
       x1 =  x1 +  j1 | 0;
       x2 =  x2 +  j2 | 0;
       x3 =  x3 +  j3 | 0;
       x4 =  x4 +  j4 | 0;
       x5 =  x5 +  j5 | 0;
       x6 =  x6 +  j6 | 0;
       x7 =  x7 +  j7 | 0;
       x8 =  x8 +  j8 | 0;
       x9 =  x9 +  j9 | 0;
      x10 = x10 + j10 | 0;
      x11 = x11 + j11 | 0;
      x12 = x12 + j12 | 0;
      x13 = x13 + j13 | 0;
      x14 = x14 + j14 | 0;
      x15 = x15 + j15 | 0;

      o[ 0] = x0 >>>  0 & 0xff;
      o[ 1] = x0 >>>  8 & 0xff;
      o[ 2] = x0 >>> 16 & 0xff;
      o[ 3] = x0 >>> 24 & 0xff;

      o[ 4] = x1 >>>  0 & 0xff;
      o[ 5] = x1 >>>  8 & 0xff;
      o[ 6] = x1 >>> 16 & 0xff;
      o[ 7] = x1 >>> 24 & 0xff;

      o[ 8] = x2 >>>  0 & 0xff;
      o[ 9] = x2 >>>  8 & 0xff;
      o[10] = x2 >>> 16 & 0xff;
      o[11] = x2 >>> 24 & 0xff;

      o[12] = x3 >>>  0 & 0xff;
      o[13] = x3 >>>  8 & 0xff;
      o[14] = x3 >>> 16 & 0xff;
      o[15] = x3 >>> 24 & 0xff;

      o[16] = x4 >>>  0 & 0xff;
      o[17] = x4 >>>  8 & 0xff;
      o[18] = x4 >>> 16 & 0xff;
      o[19] = x4 >>> 24 & 0xff;

      o[20] = x5 >>>  0 & 0xff;
      o[21] = x5 >>>  8 & 0xff;
      o[22] = x5 >>> 16 & 0xff;
      o[23] = x5 >>> 24 & 0xff;

      o[24] = x6 >>>  0 & 0xff;
      o[25] = x6 >>>  8 & 0xff;
      o[26] = x6 >>> 16 & 0xff;
      o[27] = x6 >>> 24 & 0xff;

      o[28] = x7 >>>  0 & 0xff;
      o[29] = x7 >>>  8 & 0xff;
      o[30] = x7 >>> 16 & 0xff;
      o[31] = x7 >>> 24 & 0xff;

      o[32] = x8 >>>  0 & 0xff;
      o[33] = x8 >>>  8 & 0xff;
      o[34] = x8 >>> 16 & 0xff;
      o[35] = x8 >>> 24 & 0xff;

      o[36] = x9 >>>  0 & 0xff;
      o[37] = x9 >>>  8 & 0xff;
      o[38] = x9 >>> 16 & 0xff;
      o[39] = x9 >>> 24 & 0xff;

      o[40] = x10 >>>  0 & 0xff;
      o[41] = x10 >>>  8 & 0xff;
      o[42] = x10 >>> 16 & 0xff;
      o[43] = x10 >>> 24 & 0xff;

      o[44] = x11 >>>  0 & 0xff;
      o[45] = x11 >>>  8 & 0xff;
      o[46] = x11 >>> 16 & 0xff;
      o[47] = x11 >>> 24 & 0xff;

      o[48] = x12 >>>  0 & 0xff;
      o[49] = x12 >>>  8 & 0xff;
      o[50] = x12 >>> 16 & 0xff;
      o[51] = x12 >>> 24 & 0xff;

      o[52] = x13 >>>  0 & 0xff;
      o[53] = x13 >>>  8 & 0xff;
      o[54] = x13 >>> 16 & 0xff;
      o[55] = x13 >>> 24 & 0xff;

      o[56] = x14 >>>  0 & 0xff;
      o[57] = x14 >>>  8 & 0xff;
      o[58] = x14 >>> 16 & 0xff;
      o[59] = x14 >>> 24 & 0xff;

      o[60] = x15 >>>  0 & 0xff;
      o[61] = x15 >>>  8 & 0xff;
      o[62] = x15 >>> 16 & 0xff;
      o[63] = x15 >>> 24 & 0xff;
    }

    function core_hsalsa20(o,p,k,c) {
      var j0  = c[ 0] & 0xff | (c[ 1] & 0xff)<<8 | (c[ 2] & 0xff)<<16 | (c[ 3] & 0xff)<<24,
          j1  = k[ 0] & 0xff | (k[ 1] & 0xff)<<8 | (k[ 2] & 0xff)<<16 | (k[ 3] & 0xff)<<24,
          j2  = k[ 4] & 0xff | (k[ 5] & 0xff)<<8 | (k[ 6] & 0xff)<<16 | (k[ 7] & 0xff)<<24,
          j3  = k[ 8] & 0xff | (k[ 9] & 0xff)<<8 | (k[10] & 0xff)<<16 | (k[11] & 0xff)<<24,
          j4  = k[12] & 0xff | (k[13] & 0xff)<<8 | (k[14] & 0xff)<<16 | (k[15] & 0xff)<<24,
          j5  = c[ 4] & 0xff | (c[ 5] & 0xff)<<8 | (c[ 6] & 0xff)<<16 | (c[ 7] & 0xff)<<24,
          j6  = p[ 0] & 0xff | (p[ 1] & 0xff)<<8 | (p[ 2] & 0xff)<<16 | (p[ 3] & 0xff)<<24,
          j7  = p[ 4] & 0xff | (p[ 5] & 0xff)<<8 | (p[ 6] & 0xff)<<16 | (p[ 7] & 0xff)<<24,
          j8  = p[ 8] & 0xff | (p[ 9] & 0xff)<<8 | (p[10] & 0xff)<<16 | (p[11] & 0xff)<<24,
          j9  = p[12] & 0xff | (p[13] & 0xff)<<8 | (p[14] & 0xff)<<16 | (p[15] & 0xff)<<24,
          j10 = c[ 8] & 0xff | (c[ 9] & 0xff)<<8 | (c[10] & 0xff)<<16 | (c[11] & 0xff)<<24,
          j11 = k[16] & 0xff | (k[17] & 0xff)<<8 | (k[18] & 0xff)<<16 | (k[19] & 0xff)<<24,
          j12 = k[20] & 0xff | (k[21] & 0xff)<<8 | (k[22] & 0xff)<<16 | (k[23] & 0xff)<<24,
          j13 = k[24] & 0xff | (k[25] & 0xff)<<8 | (k[26] & 0xff)<<16 | (k[27] & 0xff)<<24,
          j14 = k[28] & 0xff | (k[29] & 0xff)<<8 | (k[30] & 0xff)<<16 | (k[31] & 0xff)<<24,
          j15 = c[12] & 0xff | (c[13] & 0xff)<<8 | (c[14] & 0xff)<<16 | (c[15] & 0xff)<<24;

      var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7,
          x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14,
          x15 = j15, u;

      for (var i = 0; i < 20; i += 2) {
        u = x0 + x12 | 0;
        x4 ^= u<<7 | u>>>(32-7);
        u = x4 + x0 | 0;
        x8 ^= u<<9 | u>>>(32-9);
        u = x8 + x4 | 0;
        x12 ^= u<<13 | u>>>(32-13);
        u = x12 + x8 | 0;
        x0 ^= u<<18 | u>>>(32-18);

        u = x5 + x1 | 0;
        x9 ^= u<<7 | u>>>(32-7);
        u = x9 + x5 | 0;
        x13 ^= u<<9 | u>>>(32-9);
        u = x13 + x9 | 0;
        x1 ^= u<<13 | u>>>(32-13);
        u = x1 + x13 | 0;
        x5 ^= u<<18 | u>>>(32-18);

        u = x10 + x6 | 0;
        x14 ^= u<<7 | u>>>(32-7);
        u = x14 + x10 | 0;
        x2 ^= u<<9 | u>>>(32-9);
        u = x2 + x14 | 0;
        x6 ^= u<<13 | u>>>(32-13);
        u = x6 + x2 | 0;
        x10 ^= u<<18 | u>>>(32-18);

        u = x15 + x11 | 0;
        x3 ^= u<<7 | u>>>(32-7);
        u = x3 + x15 | 0;
        x7 ^= u<<9 | u>>>(32-9);
        u = x7 + x3 | 0;
        x11 ^= u<<13 | u>>>(32-13);
        u = x11 + x7 | 0;
        x15 ^= u<<18 | u>>>(32-18);

        u = x0 + x3 | 0;
        x1 ^= u<<7 | u>>>(32-7);
        u = x1 + x0 | 0;
        x2 ^= u<<9 | u>>>(32-9);
        u = x2 + x1 | 0;
        x3 ^= u<<13 | u>>>(32-13);
        u = x3 + x2 | 0;
        x0 ^= u<<18 | u>>>(32-18);

        u = x5 + x4 | 0;
        x6 ^= u<<7 | u>>>(32-7);
        u = x6 + x5 | 0;
        x7 ^= u<<9 | u>>>(32-9);
        u = x7 + x6 | 0;
        x4 ^= u<<13 | u>>>(32-13);
        u = x4 + x7 | 0;
        x5 ^= u<<18 | u>>>(32-18);

        u = x10 + x9 | 0;
        x11 ^= u<<7 | u>>>(32-7);
        u = x11 + x10 | 0;
        x8 ^= u<<9 | u>>>(32-9);
        u = x8 + x11 | 0;
        x9 ^= u<<13 | u>>>(32-13);
        u = x9 + x8 | 0;
        x10 ^= u<<18 | u>>>(32-18);

        u = x15 + x14 | 0;
        x12 ^= u<<7 | u>>>(32-7);
        u = x12 + x15 | 0;
        x13 ^= u<<9 | u>>>(32-9);
        u = x13 + x12 | 0;
        x14 ^= u<<13 | u>>>(32-13);
        u = x14 + x13 | 0;
        x15 ^= u<<18 | u>>>(32-18);
      }

      o[ 0] = x0 >>>  0 & 0xff;
      o[ 1] = x0 >>>  8 & 0xff;
      o[ 2] = x0 >>> 16 & 0xff;
      o[ 3] = x0 >>> 24 & 0xff;

      o[ 4] = x5 >>>  0 & 0xff;
      o[ 5] = x5 >>>  8 & 0xff;
      o[ 6] = x5 >>> 16 & 0xff;
      o[ 7] = x5 >>> 24 & 0xff;

      o[ 8] = x10 >>>  0 & 0xff;
      o[ 9] = x10 >>>  8 & 0xff;
      o[10] = x10 >>> 16 & 0xff;
      o[11] = x10 >>> 24 & 0xff;

      o[12] = x15 >>>  0 & 0xff;
      o[13] = x15 >>>  8 & 0xff;
      o[14] = x15 >>> 16 & 0xff;
      o[15] = x15 >>> 24 & 0xff;

      o[16] = x6 >>>  0 & 0xff;
      o[17] = x6 >>>  8 & 0xff;
      o[18] = x6 >>> 16 & 0xff;
      o[19] = x6 >>> 24 & 0xff;

      o[20] = x7 >>>  0 & 0xff;
      o[21] = x7 >>>  8 & 0xff;
      o[22] = x7 >>> 16 & 0xff;
      o[23] = x7 >>> 24 & 0xff;

      o[24] = x8 >>>  0 & 0xff;
      o[25] = x8 >>>  8 & 0xff;
      o[26] = x8 >>> 16 & 0xff;
      o[27] = x8 >>> 24 & 0xff;

      o[28] = x9 >>>  0 & 0xff;
      o[29] = x9 >>>  8 & 0xff;
      o[30] = x9 >>> 16 & 0xff;
      o[31] = x9 >>> 24 & 0xff;
    }

    function crypto_core_salsa20(out,inp,k,c) {
      core_salsa20(out,inp,k,c);
    }

    function crypto_core_hsalsa20(out,inp,k,c) {
      core_hsalsa20(out,inp,k,c);
    }

    var sigma = new Uint8Array([101, 120, 112, 97, 110, 100, 32, 51, 50, 45, 98, 121, 116, 101, 32, 107]);
                // "expand 32-byte k"

    function crypto_stream_salsa20_xor(c,cpos,m,mpos,b,n,k) {
      var z = new Uint8Array(16), x = new Uint8Array(64);
      var u, i;
      for (i = 0; i < 16; i++) z[i] = 0;
      for (i = 0; i < 8; i++) z[i] = n[i];
      while (b >= 64) {
        crypto_core_salsa20(x,z,k,sigma);
        for (i = 0; i < 64; i++) c[cpos+i] = m[mpos+i] ^ x[i];
        u = 1;
        for (i = 8; i < 16; i++) {
          u = u + (z[i] & 0xff) | 0;
          z[i] = u & 0xff;
          u >>>= 8;
        }
        b -= 64;
        cpos += 64;
        mpos += 64;
      }
      if (b > 0) {
        crypto_core_salsa20(x,z,k,sigma);
        for (i = 0; i < b; i++) c[cpos+i] = m[mpos+i] ^ x[i];
      }
      return 0;
    }

    function crypto_stream_salsa20(c,cpos,b,n,k) {
      var z = new Uint8Array(16), x = new Uint8Array(64);
      var u, i;
      for (i = 0; i < 16; i++) z[i] = 0;
      for (i = 0; i < 8; i++) z[i] = n[i];
      while (b >= 64) {
        crypto_core_salsa20(x,z,k,sigma);
        for (i = 0; i < 64; i++) c[cpos+i] = x[i];
        u = 1;
        for (i = 8; i < 16; i++) {
          u = u + (z[i] & 0xff) | 0;
          z[i] = u & 0xff;
          u >>>= 8;
        }
        b -= 64;
        cpos += 64;
      }
      if (b > 0) {
        crypto_core_salsa20(x,z,k,sigma);
        for (i = 0; i < b; i++) c[cpos+i] = x[i];
      }
      return 0;
    }

    function crypto_stream(c,cpos,d,n,k) {
      var s = new Uint8Array(32);
      crypto_core_hsalsa20(s,n,k,sigma);
      var sn = new Uint8Array(8);
      for (var i = 0; i < 8; i++) sn[i] = n[i+16];
      return crypto_stream_salsa20(c,cpos,d,sn,s);
    }

    function crypto_stream_xor(c,cpos,m,mpos,d,n,k) {
      var s = new Uint8Array(32);
      crypto_core_hsalsa20(s,n,k,sigma);
      var sn = new Uint8Array(8);
      for (var i = 0; i < 8; i++) sn[i] = n[i+16];
      return crypto_stream_salsa20_xor(c,cpos,m,mpos,d,sn,s);
    }

    /*
    * Port of Andrew Moon's Poly1305-donna-16. Public domain.
    * https://github.com/floodyberry/poly1305-donna
    */

    var poly1305 = function(key) {
      this.buffer = new Uint8Array(16);
      this.r = new Uint16Array(10);
      this.h = new Uint16Array(10);
      this.pad = new Uint16Array(8);
      this.leftover = 0;
      this.fin = 0;

      var t0, t1, t2, t3, t4, t5, t6, t7;

      t0 = key[ 0] & 0xff | (key[ 1] & 0xff) << 8; this.r[0] = ( t0                     ) & 0x1fff;
      t1 = key[ 2] & 0xff | (key[ 3] & 0xff) << 8; this.r[1] = ((t0 >>> 13) | (t1 <<  3)) & 0x1fff;
      t2 = key[ 4] & 0xff | (key[ 5] & 0xff) << 8; this.r[2] = ((t1 >>> 10) | (t2 <<  6)) & 0x1f03;
      t3 = key[ 6] & 0xff | (key[ 7] & 0xff) << 8; this.r[3] = ((t2 >>>  7) | (t3 <<  9)) & 0x1fff;
      t4 = key[ 8] & 0xff | (key[ 9] & 0xff) << 8; this.r[4] = ((t3 >>>  4) | (t4 << 12)) & 0x00ff;
      this.r[5] = ((t4 >>>  1)) & 0x1ffe;
      t5 = key[10] & 0xff | (key[11] & 0xff) << 8; this.r[6] = ((t4 >>> 14) | (t5 <<  2)) & 0x1fff;
      t6 = key[12] & 0xff | (key[13] & 0xff) << 8; this.r[7] = ((t5 >>> 11) | (t6 <<  5)) & 0x1f81;
      t7 = key[14] & 0xff | (key[15] & 0xff) << 8; this.r[8] = ((t6 >>>  8) | (t7 <<  8)) & 0x1fff;
      this.r[9] = ((t7 >>>  5)) & 0x007f;

      this.pad[0] = key[16] & 0xff | (key[17] & 0xff) << 8;
      this.pad[1] = key[18] & 0xff | (key[19] & 0xff) << 8;
      this.pad[2] = key[20] & 0xff | (key[21] & 0xff) << 8;
      this.pad[3] = key[22] & 0xff | (key[23] & 0xff) << 8;
      this.pad[4] = key[24] & 0xff | (key[25] & 0xff) << 8;
      this.pad[5] = key[26] & 0xff | (key[27] & 0xff) << 8;
      this.pad[6] = key[28] & 0xff | (key[29] & 0xff) << 8;
      this.pad[7] = key[30] & 0xff | (key[31] & 0xff) << 8;
    };

    poly1305.prototype.blocks = function(m, mpos, bytes) {
      var hibit = this.fin ? 0 : (1 << 11);
      var t0, t1, t2, t3, t4, t5, t6, t7, c;
      var d0, d1, d2, d3, d4, d5, d6, d7, d8, d9;

      var h0 = this.h[0],
          h1 = this.h[1],
          h2 = this.h[2],
          h3 = this.h[3],
          h4 = this.h[4],
          h5 = this.h[5],
          h6 = this.h[6],
          h7 = this.h[7],
          h8 = this.h[8],
          h9 = this.h[9];

      var r0 = this.r[0],
          r1 = this.r[1],
          r2 = this.r[2],
          r3 = this.r[3],
          r4 = this.r[4],
          r5 = this.r[5],
          r6 = this.r[6],
          r7 = this.r[7],
          r8 = this.r[8],
          r9 = this.r[9];

      while (bytes >= 16) {
        t0 = m[mpos+ 0] & 0xff | (m[mpos+ 1] & 0xff) << 8; h0 += ( t0                     ) & 0x1fff;
        t1 = m[mpos+ 2] & 0xff | (m[mpos+ 3] & 0xff) << 8; h1 += ((t0 >>> 13) | (t1 <<  3)) & 0x1fff;
        t2 = m[mpos+ 4] & 0xff | (m[mpos+ 5] & 0xff) << 8; h2 += ((t1 >>> 10) | (t2 <<  6)) & 0x1fff;
        t3 = m[mpos+ 6] & 0xff | (m[mpos+ 7] & 0xff) << 8; h3 += ((t2 >>>  7) | (t3 <<  9)) & 0x1fff;
        t4 = m[mpos+ 8] & 0xff | (m[mpos+ 9] & 0xff) << 8; h4 += ((t3 >>>  4) | (t4 << 12)) & 0x1fff;
        h5 += ((t4 >>>  1)) & 0x1fff;
        t5 = m[mpos+10] & 0xff | (m[mpos+11] & 0xff) << 8; h6 += ((t4 >>> 14) | (t5 <<  2)) & 0x1fff;
        t6 = m[mpos+12] & 0xff | (m[mpos+13] & 0xff) << 8; h7 += ((t5 >>> 11) | (t6 <<  5)) & 0x1fff;
        t7 = m[mpos+14] & 0xff | (m[mpos+15] & 0xff) << 8; h8 += ((t6 >>>  8) | (t7 <<  8)) & 0x1fff;
        h9 += ((t7 >>> 5)) | hibit;

        c = 0;

        d0 = c;
        d0 += h0 * r0;
        d0 += h1 * (5 * r9);
        d0 += h2 * (5 * r8);
        d0 += h3 * (5 * r7);
        d0 += h4 * (5 * r6);
        c = (d0 >>> 13); d0 &= 0x1fff;
        d0 += h5 * (5 * r5);
        d0 += h6 * (5 * r4);
        d0 += h7 * (5 * r3);
        d0 += h8 * (5 * r2);
        d0 += h9 * (5 * r1);
        c += (d0 >>> 13); d0 &= 0x1fff;

        d1 = c;
        d1 += h0 * r1;
        d1 += h1 * r0;
        d1 += h2 * (5 * r9);
        d1 += h3 * (5 * r8);
        d1 += h4 * (5 * r7);
        c = (d1 >>> 13); d1 &= 0x1fff;
        d1 += h5 * (5 * r6);
        d1 += h6 * (5 * r5);
        d1 += h7 * (5 * r4);
        d1 += h8 * (5 * r3);
        d1 += h9 * (5 * r2);
        c += (d1 >>> 13); d1 &= 0x1fff;

        d2 = c;
        d2 += h0 * r2;
        d2 += h1 * r1;
        d2 += h2 * r0;
        d2 += h3 * (5 * r9);
        d2 += h4 * (5 * r8);
        c = (d2 >>> 13); d2 &= 0x1fff;
        d2 += h5 * (5 * r7);
        d2 += h6 * (5 * r6);
        d2 += h7 * (5 * r5);
        d2 += h8 * (5 * r4);
        d2 += h9 * (5 * r3);
        c += (d2 >>> 13); d2 &= 0x1fff;

        d3 = c;
        d3 += h0 * r3;
        d3 += h1 * r2;
        d3 += h2 * r1;
        d3 += h3 * r0;
        d3 += h4 * (5 * r9);
        c = (d3 >>> 13); d3 &= 0x1fff;
        d3 += h5 * (5 * r8);
        d3 += h6 * (5 * r7);
        d3 += h7 * (5 * r6);
        d3 += h8 * (5 * r5);
        d3 += h9 * (5 * r4);
        c += (d3 >>> 13); d3 &= 0x1fff;

        d4 = c;
        d4 += h0 * r4;
        d4 += h1 * r3;
        d4 += h2 * r2;
        d4 += h3 * r1;
        d4 += h4 * r0;
        c = (d4 >>> 13); d4 &= 0x1fff;
        d4 += h5 * (5 * r9);
        d4 += h6 * (5 * r8);
        d4 += h7 * (5 * r7);
        d4 += h8 * (5 * r6);
        d4 += h9 * (5 * r5);
        c += (d4 >>> 13); d4 &= 0x1fff;

        d5 = c;
        d5 += h0 * r5;
        d5 += h1 * r4;
        d5 += h2 * r3;
        d5 += h3 * r2;
        d5 += h4 * r1;
        c = (d5 >>> 13); d5 &= 0x1fff;
        d5 += h5 * r0;
        d5 += h6 * (5 * r9);
        d5 += h7 * (5 * r8);
        d5 += h8 * (5 * r7);
        d5 += h9 * (5 * r6);
        c += (d5 >>> 13); d5 &= 0x1fff;

        d6 = c;
        d6 += h0 * r6;
        d6 += h1 * r5;
        d6 += h2 * r4;
        d6 += h3 * r3;
        d6 += h4 * r2;
        c = (d6 >>> 13); d6 &= 0x1fff;
        d6 += h5 * r1;
        d6 += h6 * r0;
        d6 += h7 * (5 * r9);
        d6 += h8 * (5 * r8);
        d6 += h9 * (5 * r7);
        c += (d6 >>> 13); d6 &= 0x1fff;

        d7 = c;
        d7 += h0 * r7;
        d7 += h1 * r6;
        d7 += h2 * r5;
        d7 += h3 * r4;
        d7 += h4 * r3;
        c = (d7 >>> 13); d7 &= 0x1fff;
        d7 += h5 * r2;
        d7 += h6 * r1;
        d7 += h7 * r0;
        d7 += h8 * (5 * r9);
        d7 += h9 * (5 * r8);
        c += (d7 >>> 13); d7 &= 0x1fff;

        d8 = c;
        d8 += h0 * r8;
        d8 += h1 * r7;
        d8 += h2 * r6;
        d8 += h3 * r5;
        d8 += h4 * r4;
        c = (d8 >>> 13); d8 &= 0x1fff;
        d8 += h5 * r3;
        d8 += h6 * r2;
        d8 += h7 * r1;
        d8 += h8 * r0;
        d8 += h9 * (5 * r9);
        c += (d8 >>> 13); d8 &= 0x1fff;

        d9 = c;
        d9 += h0 * r9;
        d9 += h1 * r8;
        d9 += h2 * r7;
        d9 += h3 * r6;
        d9 += h4 * r5;
        c = (d9 >>> 13); d9 &= 0x1fff;
        d9 += h5 * r4;
        d9 += h6 * r3;
        d9 += h7 * r2;
        d9 += h8 * r1;
        d9 += h9 * r0;
        c += (d9 >>> 13); d9 &= 0x1fff;

        c = (((c << 2) + c)) | 0;
        c = (c + d0) | 0;
        d0 = c & 0x1fff;
        c = (c >>> 13);
        d1 += c;

        h0 = d0;
        h1 = d1;
        h2 = d2;
        h3 = d3;
        h4 = d4;
        h5 = d5;
        h6 = d6;
        h7 = d7;
        h8 = d8;
        h9 = d9;

        mpos += 16;
        bytes -= 16;
      }
      this.h[0] = h0;
      this.h[1] = h1;
      this.h[2] = h2;
      this.h[3] = h3;
      this.h[4] = h4;
      this.h[5] = h5;
      this.h[6] = h6;
      this.h[7] = h7;
      this.h[8] = h8;
      this.h[9] = h9;
    };

    poly1305.prototype.finish = function(mac, macpos) {
      var g = new Uint16Array(10);
      var c, mask, f, i;

      if (this.leftover) {
        i = this.leftover;
        this.buffer[i++] = 1;
        for (; i < 16; i++) this.buffer[i] = 0;
        this.fin = 1;
        this.blocks(this.buffer, 0, 16);
      }

      c = this.h[1] >>> 13;
      this.h[1] &= 0x1fff;
      for (i = 2; i < 10; i++) {
        this.h[i] += c;
        c = this.h[i] >>> 13;
        this.h[i] &= 0x1fff;
      }
      this.h[0] += (c * 5);
      c = this.h[0] >>> 13;
      this.h[0] &= 0x1fff;
      this.h[1] += c;
      c = this.h[1] >>> 13;
      this.h[1] &= 0x1fff;
      this.h[2] += c;

      g[0] = this.h[0] + 5;
      c = g[0] >>> 13;
      g[0] &= 0x1fff;
      for (i = 1; i < 10; i++) {
        g[i] = this.h[i] + c;
        c = g[i] >>> 13;
        g[i] &= 0x1fff;
      }
      g[9] -= (1 << 13);

      mask = (c ^ 1) - 1;
      for (i = 0; i < 10; i++) g[i] &= mask;
      mask = ~mask;
      for (i = 0; i < 10; i++) this.h[i] = (this.h[i] & mask) | g[i];

      this.h[0] = ((this.h[0]       ) | (this.h[1] << 13)                    ) & 0xffff;
      this.h[1] = ((this.h[1] >>>  3) | (this.h[2] << 10)                    ) & 0xffff;
      this.h[2] = ((this.h[2] >>>  6) | (this.h[3] <<  7)                    ) & 0xffff;
      this.h[3] = ((this.h[3] >>>  9) | (this.h[4] <<  4)                    ) & 0xffff;
      this.h[4] = ((this.h[4] >>> 12) | (this.h[5] <<  1) | (this.h[6] << 14)) & 0xffff;
      this.h[5] = ((this.h[6] >>>  2) | (this.h[7] << 11)                    ) & 0xffff;
      this.h[6] = ((this.h[7] >>>  5) | (this.h[8] <<  8)                    ) & 0xffff;
      this.h[7] = ((this.h[8] >>>  8) | (this.h[9] <<  5)                    ) & 0xffff;

      f = this.h[0] + this.pad[0];
      this.h[0] = f & 0xffff;
      for (i = 1; i < 8; i++) {
        f = (((this.h[i] + this.pad[i]) | 0) + (f >>> 16)) | 0;
        this.h[i] = f & 0xffff;
      }

      mac[macpos+ 0] = (this.h[0] >>> 0) & 0xff;
      mac[macpos+ 1] = (this.h[0] >>> 8) & 0xff;
      mac[macpos+ 2] = (this.h[1] >>> 0) & 0xff;
      mac[macpos+ 3] = (this.h[1] >>> 8) & 0xff;
      mac[macpos+ 4] = (this.h[2] >>> 0) & 0xff;
      mac[macpos+ 5] = (this.h[2] >>> 8) & 0xff;
      mac[macpos+ 6] = (this.h[3] >>> 0) & 0xff;
      mac[macpos+ 7] = (this.h[3] >>> 8) & 0xff;
      mac[macpos+ 8] = (this.h[4] >>> 0) & 0xff;
      mac[macpos+ 9] = (this.h[4] >>> 8) & 0xff;
      mac[macpos+10] = (this.h[5] >>> 0) & 0xff;
      mac[macpos+11] = (this.h[5] >>> 8) & 0xff;
      mac[macpos+12] = (this.h[6] >>> 0) & 0xff;
      mac[macpos+13] = (this.h[6] >>> 8) & 0xff;
      mac[macpos+14] = (this.h[7] >>> 0) & 0xff;
      mac[macpos+15] = (this.h[7] >>> 8) & 0xff;
    };

    poly1305.prototype.update = function(m, mpos, bytes) {
      var i, want;

      if (this.leftover) {
        want = (16 - this.leftover);
        if (want > bytes)
          want = bytes;
        for (i = 0; i < want; i++)
          this.buffer[this.leftover + i] = m[mpos+i];
        bytes -= want;
        mpos += want;
        this.leftover += want;
        if (this.leftover < 16)
          return;
        this.blocks(this.buffer, 0, 16);
        this.leftover = 0;
      }

      if (bytes >= 16) {
        want = bytes - (bytes % 16);
        this.blocks(m, mpos, want);
        mpos += want;
        bytes -= want;
      }

      if (bytes) {
        for (i = 0; i < bytes; i++)
          this.buffer[this.leftover + i] = m[mpos+i];
        this.leftover += bytes;
      }
    };

    function crypto_onetimeauth(out, outpos, m, mpos, n, k) {
      var s = new poly1305(k);
      s.update(m, mpos, n);
      s.finish(out, outpos);
      return 0;
    }

    function crypto_onetimeauth_verify(h, hpos, m, mpos, n, k) {
      var x = new Uint8Array(16);
      crypto_onetimeauth(x,0,m,mpos,n,k);
      return crypto_verify_16(h,hpos,x,0);
    }

    function crypto_secretbox(c,m,d,n,k) {
      var i;
      if (d < 32) return -1;
      crypto_stream_xor(c,0,m,0,d,n,k);
      crypto_onetimeauth(c, 16, c, 32, d - 32, c);
      for (i = 0; i < 16; i++) c[i] = 0;
      return 0;
    }

    function crypto_secretbox_open(m,c,d,n,k) {
      var i;
      var x = new Uint8Array(32);
      if (d < 32) return -1;
      crypto_stream(x,0,32,n,k);
      if (crypto_onetimeauth_verify(c, 16,c, 32,d - 32,x) !== 0) return -1;
      crypto_stream_xor(m,0,c,0,d,n,k);
      for (i = 0; i < 32; i++) m[i] = 0;
      return 0;
    }

    function set25519(r, a) {
      var i;
      for (i = 0; i < 16; i++) r[i] = a[i]|0;
    }

    function car25519(o) {
      var i, v, c = 1;
      for (i = 0; i < 16; i++) {
        v = o[i] + c + 65535;
        c = Math.floor(v / 65536);
        o[i] = v - c * 65536;
      }
      o[0] += c-1 + 37 * (c-1);
    }

    function sel25519(p, q, b) {
      var t, c = ~(b-1);
      for (var i = 0; i < 16; i++) {
        t = c & (p[i] ^ q[i]);
        p[i] ^= t;
        q[i] ^= t;
      }
    }

    function pack25519(o, n) {
      var i, j, b;
      var m = gf(), t = gf();
      for (i = 0; i < 16; i++) t[i] = n[i];
      car25519(t);
      car25519(t);
      car25519(t);
      for (j = 0; j < 2; j++) {
        m[0] = t[0] - 0xffed;
        for (i = 1; i < 15; i++) {
          m[i] = t[i] - 0xffff - ((m[i-1]>>16) & 1);
          m[i-1] &= 0xffff;
        }
        m[15] = t[15] - 0x7fff - ((m[14]>>16) & 1);
        b = (m[15]>>16) & 1;
        m[14] &= 0xffff;
        sel25519(t, m, 1-b);
      }
      for (i = 0; i < 16; i++) {
        o[2*i] = t[i] & 0xff;
        o[2*i+1] = t[i]>>8;
      }
    }

    function neq25519(a, b) {
      var c = new Uint8Array(32), d = new Uint8Array(32);
      pack25519(c, a);
      pack25519(d, b);
      return crypto_verify_32(c, 0, d, 0);
    }

    function par25519(a) {
      var d = new Uint8Array(32);
      pack25519(d, a);
      return d[0] & 1;
    }

    function unpack25519(o, n) {
      var i;
      for (i = 0; i < 16; i++) o[i] = n[2*i] + (n[2*i+1] << 8);
      o[15] &= 0x7fff;
    }

    function A(o, a, b) {
      for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
    }

    function Z(o, a, b) {
      for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
    }

    function M(o, a, b) {
      var v, c,
         t0 = 0,  t1 = 0,  t2 = 0,  t3 = 0,  t4 = 0,  t5 = 0,  t6 = 0,  t7 = 0,
         t8 = 0,  t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0,
        t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0,
        t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0,
        b0 = b[0],
        b1 = b[1],
        b2 = b[2],
        b3 = b[3],
        b4 = b[4],
        b5 = b[5],
        b6 = b[6],
        b7 = b[7],
        b8 = b[8],
        b9 = b[9],
        b10 = b[10],
        b11 = b[11],
        b12 = b[12],
        b13 = b[13],
        b14 = b[14],
        b15 = b[15];

      v = a[0];
      t0 += v * b0;
      t1 += v * b1;
      t2 += v * b2;
      t3 += v * b3;
      t4 += v * b4;
      t5 += v * b5;
      t6 += v * b6;
      t7 += v * b7;
      t8 += v * b8;
      t9 += v * b9;
      t10 += v * b10;
      t11 += v * b11;
      t12 += v * b12;
      t13 += v * b13;
      t14 += v * b14;
      t15 += v * b15;
      v = a[1];
      t1 += v * b0;
      t2 += v * b1;
      t3 += v * b2;
      t4 += v * b3;
      t5 += v * b4;
      t6 += v * b5;
      t7 += v * b6;
      t8 += v * b7;
      t9 += v * b8;
      t10 += v * b9;
      t11 += v * b10;
      t12 += v * b11;
      t13 += v * b12;
      t14 += v * b13;
      t15 += v * b14;
      t16 += v * b15;
      v = a[2];
      t2 += v * b0;
      t3 += v * b1;
      t4 += v * b2;
      t5 += v * b3;
      t6 += v * b4;
      t7 += v * b5;
      t8 += v * b6;
      t9 += v * b7;
      t10 += v * b8;
      t11 += v * b9;
      t12 += v * b10;
      t13 += v * b11;
      t14 += v * b12;
      t15 += v * b13;
      t16 += v * b14;
      t17 += v * b15;
      v = a[3];
      t3 += v * b0;
      t4 += v * b1;
      t5 += v * b2;
      t6 += v * b3;
      t7 += v * b4;
      t8 += v * b5;
      t9 += v * b6;
      t10 += v * b7;
      t11 += v * b8;
      t12 += v * b9;
      t13 += v * b10;
      t14 += v * b11;
      t15 += v * b12;
      t16 += v * b13;
      t17 += v * b14;
      t18 += v * b15;
      v = a[4];
      t4 += v * b0;
      t5 += v * b1;
      t6 += v * b2;
      t7 += v * b3;
      t8 += v * b4;
      t9 += v * b5;
      t10 += v * b6;
      t11 += v * b7;
      t12 += v * b8;
      t13 += v * b9;
      t14 += v * b10;
      t15 += v * b11;
      t16 += v * b12;
      t17 += v * b13;
      t18 += v * b14;
      t19 += v * b15;
      v = a[5];
      t5 += v * b0;
      t6 += v * b1;
      t7 += v * b2;
      t8 += v * b3;
      t9 += v * b4;
      t10 += v * b5;
      t11 += v * b6;
      t12 += v * b7;
      t13 += v * b8;
      t14 += v * b9;
      t15 += v * b10;
      t16 += v * b11;
      t17 += v * b12;
      t18 += v * b13;
      t19 += v * b14;
      t20 += v * b15;
      v = a[6];
      t6 += v * b0;
      t7 += v * b1;
      t8 += v * b2;
      t9 += v * b3;
      t10 += v * b4;
      t11 += v * b5;
      t12 += v * b6;
      t13 += v * b7;
      t14 += v * b8;
      t15 += v * b9;
      t16 += v * b10;
      t17 += v * b11;
      t18 += v * b12;
      t19 += v * b13;
      t20 += v * b14;
      t21 += v * b15;
      v = a[7];
      t7 += v * b0;
      t8 += v * b1;
      t9 += v * b2;
      t10 += v * b3;
      t11 += v * b4;
      t12 += v * b5;
      t13 += v * b6;
      t14 += v * b7;
      t15 += v * b8;
      t16 += v * b9;
      t17 += v * b10;
      t18 += v * b11;
      t19 += v * b12;
      t20 += v * b13;
      t21 += v * b14;
      t22 += v * b15;
      v = a[8];
      t8 += v * b0;
      t9 += v * b1;
      t10 += v * b2;
      t11 += v * b3;
      t12 += v * b4;
      t13 += v * b5;
      t14 += v * b6;
      t15 += v * b7;
      t16 += v * b8;
      t17 += v * b9;
      t18 += v * b10;
      t19 += v * b11;
      t20 += v * b12;
      t21 += v * b13;
      t22 += v * b14;
      t23 += v * b15;
      v = a[9];
      t9 += v * b0;
      t10 += v * b1;
      t11 += v * b2;
      t12 += v * b3;
      t13 += v * b4;
      t14 += v * b5;
      t15 += v * b6;
      t16 += v * b7;
      t17 += v * b8;
      t18 += v * b9;
      t19 += v * b10;
      t20 += v * b11;
      t21 += v * b12;
      t22 += v * b13;
      t23 += v * b14;
      t24 += v * b15;
      v = a[10];
      t10 += v * b0;
      t11 += v * b1;
      t12 += v * b2;
      t13 += v * b3;
      t14 += v * b4;
      t15 += v * b5;
      t16 += v * b6;
      t17 += v * b7;
      t18 += v * b8;
      t19 += v * b9;
      t20 += v * b10;
      t21 += v * b11;
      t22 += v * b12;
      t23 += v * b13;
      t24 += v * b14;
      t25 += v * b15;
      v = a[11];
      t11 += v * b0;
      t12 += v * b1;
      t13 += v * b2;
      t14 += v * b3;
      t15 += v * b4;
      t16 += v * b5;
      t17 += v * b6;
      t18 += v * b7;
      t19 += v * b8;
      t20 += v * b9;
      t21 += v * b10;
      t22 += v * b11;
      t23 += v * b12;
      t24 += v * b13;
      t25 += v * b14;
      t26 += v * b15;
      v = a[12];
      t12 += v * b0;
      t13 += v * b1;
      t14 += v * b2;
      t15 += v * b3;
      t16 += v * b4;
      t17 += v * b5;
      t18 += v * b6;
      t19 += v * b7;
      t20 += v * b8;
      t21 += v * b9;
      t22 += v * b10;
      t23 += v * b11;
      t24 += v * b12;
      t25 += v * b13;
      t26 += v * b14;
      t27 += v * b15;
      v = a[13];
      t13 += v * b0;
      t14 += v * b1;
      t15 += v * b2;
      t16 += v * b3;
      t17 += v * b4;
      t18 += v * b5;
      t19 += v * b6;
      t20 += v * b7;
      t21 += v * b8;
      t22 += v * b9;
      t23 += v * b10;
      t24 += v * b11;
      t25 += v * b12;
      t26 += v * b13;
      t27 += v * b14;
      t28 += v * b15;
      v = a[14];
      t14 += v * b0;
      t15 += v * b1;
      t16 += v * b2;
      t17 += v * b3;
      t18 += v * b4;
      t19 += v * b5;
      t20 += v * b6;
      t21 += v * b7;
      t22 += v * b8;
      t23 += v * b9;
      t24 += v * b10;
      t25 += v * b11;
      t26 += v * b12;
      t27 += v * b13;
      t28 += v * b14;
      t29 += v * b15;
      v = a[15];
      t15 += v * b0;
      t16 += v * b1;
      t17 += v * b2;
      t18 += v * b3;
      t19 += v * b4;
      t20 += v * b5;
      t21 += v * b6;
      t22 += v * b7;
      t23 += v * b8;
      t24 += v * b9;
      t25 += v * b10;
      t26 += v * b11;
      t27 += v * b12;
      t28 += v * b13;
      t29 += v * b14;
      t30 += v * b15;

      t0  += 38 * t16;
      t1  += 38 * t17;
      t2  += 38 * t18;
      t3  += 38 * t19;
      t4  += 38 * t20;
      t5  += 38 * t21;
      t6  += 38 * t22;
      t7  += 38 * t23;
      t8  += 38 * t24;
      t9  += 38 * t25;
      t10 += 38 * t26;
      t11 += 38 * t27;
      t12 += 38 * t28;
      t13 += 38 * t29;
      t14 += 38 * t30;
      // t15 left as is

      // first car
      c = 1;
      v =  t0 + c + 65535; c = Math.floor(v / 65536);  t0 = v - c * 65536;
      v =  t1 + c + 65535; c = Math.floor(v / 65536);  t1 = v - c * 65536;
      v =  t2 + c + 65535; c = Math.floor(v / 65536);  t2 = v - c * 65536;
      v =  t3 + c + 65535; c = Math.floor(v / 65536);  t3 = v - c * 65536;
      v =  t4 + c + 65535; c = Math.floor(v / 65536);  t4 = v - c * 65536;
      v =  t5 + c + 65535; c = Math.floor(v / 65536);  t5 = v - c * 65536;
      v =  t6 + c + 65535; c = Math.floor(v / 65536);  t6 = v - c * 65536;
      v =  t7 + c + 65535; c = Math.floor(v / 65536);  t7 = v - c * 65536;
      v =  t8 + c + 65535; c = Math.floor(v / 65536);  t8 = v - c * 65536;
      v =  t9 + c + 65535; c = Math.floor(v / 65536);  t9 = v - c * 65536;
      v = t10 + c + 65535; c = Math.floor(v / 65536); t10 = v - c * 65536;
      v = t11 + c + 65535; c = Math.floor(v / 65536); t11 = v - c * 65536;
      v = t12 + c + 65535; c = Math.floor(v / 65536); t12 = v - c * 65536;
      v = t13 + c + 65535; c = Math.floor(v / 65536); t13 = v - c * 65536;
      v = t14 + c + 65535; c = Math.floor(v / 65536); t14 = v - c * 65536;
      v = t15 + c + 65535; c = Math.floor(v / 65536); t15 = v - c * 65536;
      t0 += c-1 + 37 * (c-1);

      // second car
      c = 1;
      v =  t0 + c + 65535; c = Math.floor(v / 65536);  t0 = v - c * 65536;
      v =  t1 + c + 65535; c = Math.floor(v / 65536);  t1 = v - c * 65536;
      v =  t2 + c + 65535; c = Math.floor(v / 65536);  t2 = v - c * 65536;
      v =  t3 + c + 65535; c = Math.floor(v / 65536);  t3 = v - c * 65536;
      v =  t4 + c + 65535; c = Math.floor(v / 65536);  t4 = v - c * 65536;
      v =  t5 + c + 65535; c = Math.floor(v / 65536);  t5 = v - c * 65536;
      v =  t6 + c + 65535; c = Math.floor(v / 65536);  t6 = v - c * 65536;
      v =  t7 + c + 65535; c = Math.floor(v / 65536);  t7 = v - c * 65536;
      v =  t8 + c + 65535; c = Math.floor(v / 65536);  t8 = v - c * 65536;
      v =  t9 + c + 65535; c = Math.floor(v / 65536);  t9 = v - c * 65536;
      v = t10 + c + 65535; c = Math.floor(v / 65536); t10 = v - c * 65536;
      v = t11 + c + 65535; c = Math.floor(v / 65536); t11 = v - c * 65536;
      v = t12 + c + 65535; c = Math.floor(v / 65536); t12 = v - c * 65536;
      v = t13 + c + 65535; c = Math.floor(v / 65536); t13 = v - c * 65536;
      v = t14 + c + 65535; c = Math.floor(v / 65536); t14 = v - c * 65536;
      v = t15 + c + 65535; c = Math.floor(v / 65536); t15 = v - c * 65536;
      t0 += c-1 + 37 * (c-1);

      o[ 0] = t0;
      o[ 1] = t1;
      o[ 2] = t2;
      o[ 3] = t3;
      o[ 4] = t4;
      o[ 5] = t5;
      o[ 6] = t6;
      o[ 7] = t7;
      o[ 8] = t8;
      o[ 9] = t9;
      o[10] = t10;
      o[11] = t11;
      o[12] = t12;
      o[13] = t13;
      o[14] = t14;
      o[15] = t15;
    }

    function S(o, a) {
      M(o, a, a);
    }

    function inv25519(o, i) {
      var c = gf();
      var a;
      for (a = 0; a < 16; a++) c[a] = i[a];
      for (a = 253; a >= 0; a--) {
        S(c, c);
        if(a !== 2 && a !== 4) M(c, c, i);
      }
      for (a = 0; a < 16; a++) o[a] = c[a];
    }

    function pow2523(o, i) {
      var c = gf();
      var a;
      for (a = 0; a < 16; a++) c[a] = i[a];
      for (a = 250; a >= 0; a--) {
          S(c, c);
          if(a !== 1) M(c, c, i);
      }
      for (a = 0; a < 16; a++) o[a] = c[a];
    }

    function crypto_scalarmult(q, n, p) {
      var z = new Uint8Array(32);
      var x = new Float64Array(80), r, i;
      var a = gf(), b = gf(), c = gf(),
          d = gf(), e = gf(), f = gf();
      for (i = 0; i < 31; i++) z[i] = n[i];
      z[31]=(n[31]&127)|64;
      z[0]&=248;
      unpack25519(x,p);
      for (i = 0; i < 16; i++) {
        b[i]=x[i];
        d[i]=a[i]=c[i]=0;
      }
      a[0]=d[0]=1;
      for (i=254; i>=0; --i) {
        r=(z[i>>>3]>>>(i&7))&1;
        sel25519(a,b,r);
        sel25519(c,d,r);
        A(e,a,c);
        Z(a,a,c);
        A(c,b,d);
        Z(b,b,d);
        S(d,e);
        S(f,a);
        M(a,c,a);
        M(c,b,e);
        A(e,a,c);
        Z(a,a,c);
        S(b,a);
        Z(c,d,f);
        M(a,c,_121665);
        A(a,a,d);
        M(c,c,a);
        M(a,d,f);
        M(d,b,x);
        S(b,e);
        sel25519(a,b,r);
        sel25519(c,d,r);
      }
      for (i = 0; i < 16; i++) {
        x[i+16]=a[i];
        x[i+32]=c[i];
        x[i+48]=b[i];
        x[i+64]=d[i];
      }
      var x32 = x.subarray(32);
      var x16 = x.subarray(16);
      inv25519(x32,x32);
      M(x16,x16,x32);
      pack25519(q,x16);
      return 0;
    }

    function crypto_scalarmult_base(q, n) {
      return crypto_scalarmult(q, n, _9);
    }

    function crypto_box_keypair(y, x) {
      randombytes(x, 32);
      return crypto_scalarmult_base(y, x);
    }

    function crypto_box_beforenm(k, y, x) {
      var s = new Uint8Array(32);
      crypto_scalarmult(s, x, y);
      return crypto_core_hsalsa20(k, _0, s, sigma);
    }

    var crypto_box_afternm = crypto_secretbox;
    var crypto_box_open_afternm = crypto_secretbox_open;

    function crypto_box(c, m, d, n, y, x) {
      var k = new Uint8Array(32);
      crypto_box_beforenm(k, y, x);
      return crypto_box_afternm(c, m, d, n, k);
    }

    function crypto_box_open(m, c, d, n, y, x) {
      var k = new Uint8Array(32);
      crypto_box_beforenm(k, y, x);
      return crypto_box_open_afternm(m, c, d, n, k);
    }

    var K = [
      0x428a2f98, 0xd728ae22, 0x71374491, 0x23ef65cd,
      0xb5c0fbcf, 0xec4d3b2f, 0xe9b5dba5, 0x8189dbbc,
      0x3956c25b, 0xf348b538, 0x59f111f1, 0xb605d019,
      0x923f82a4, 0xaf194f9b, 0xab1c5ed5, 0xda6d8118,
      0xd807aa98, 0xa3030242, 0x12835b01, 0x45706fbe,
      0x243185be, 0x4ee4b28c, 0x550c7dc3, 0xd5ffb4e2,
      0x72be5d74, 0xf27b896f, 0x80deb1fe, 0x3b1696b1,
      0x9bdc06a7, 0x25c71235, 0xc19bf174, 0xcf692694,
      0xe49b69c1, 0x9ef14ad2, 0xefbe4786, 0x384f25e3,
      0x0fc19dc6, 0x8b8cd5b5, 0x240ca1cc, 0x77ac9c65,
      0x2de92c6f, 0x592b0275, 0x4a7484aa, 0x6ea6e483,
      0x5cb0a9dc, 0xbd41fbd4, 0x76f988da, 0x831153b5,
      0x983e5152, 0xee66dfab, 0xa831c66d, 0x2db43210,
      0xb00327c8, 0x98fb213f, 0xbf597fc7, 0xbeef0ee4,
      0xc6e00bf3, 0x3da88fc2, 0xd5a79147, 0x930aa725,
      0x06ca6351, 0xe003826f, 0x14292967, 0x0a0e6e70,
      0x27b70a85, 0x46d22ffc, 0x2e1b2138, 0x5c26c926,
      0x4d2c6dfc, 0x5ac42aed, 0x53380d13, 0x9d95b3df,
      0x650a7354, 0x8baf63de, 0x766a0abb, 0x3c77b2a8,
      0x81c2c92e, 0x47edaee6, 0x92722c85, 0x1482353b,
      0xa2bfe8a1, 0x4cf10364, 0xa81a664b, 0xbc423001,
      0xc24b8b70, 0xd0f89791, 0xc76c51a3, 0x0654be30,
      0xd192e819, 0xd6ef5218, 0xd6990624, 0x5565a910,
      0xf40e3585, 0x5771202a, 0x106aa070, 0x32bbd1b8,
      0x19a4c116, 0xb8d2d0c8, 0x1e376c08, 0x5141ab53,
      0x2748774c, 0xdf8eeb99, 0x34b0bcb5, 0xe19b48a8,
      0x391c0cb3, 0xc5c95a63, 0x4ed8aa4a, 0xe3418acb,
      0x5b9cca4f, 0x7763e373, 0x682e6ff3, 0xd6b2b8a3,
      0x748f82ee, 0x5defb2fc, 0x78a5636f, 0x43172f60,
      0x84c87814, 0xa1f0ab72, 0x8cc70208, 0x1a6439ec,
      0x90befffa, 0x23631e28, 0xa4506ceb, 0xde82bde9,
      0xbef9a3f7, 0xb2c67915, 0xc67178f2, 0xe372532b,
      0xca273ece, 0xea26619c, 0xd186b8c7, 0x21c0c207,
      0xeada7dd6, 0xcde0eb1e, 0xf57d4f7f, 0xee6ed178,
      0x06f067aa, 0x72176fba, 0x0a637dc5, 0xa2c898a6,
      0x113f9804, 0xbef90dae, 0x1b710b35, 0x131c471b,
      0x28db77f5, 0x23047d84, 0x32caab7b, 0x40c72493,
      0x3c9ebe0a, 0x15c9bebc, 0x431d67c4, 0x9c100d4c,
      0x4cc5d4be, 0xcb3e42b6, 0x597f299c, 0xfc657e2a,
      0x5fcb6fab, 0x3ad6faec, 0x6c44198c, 0x4a475817
    ];

    function crypto_hashblocks_hl(hh, hl, m, n) {
      var wh = new Int32Array(16), wl = new Int32Array(16),
          bh0, bh1, bh2, bh3, bh4, bh5, bh6, bh7,
          bl0, bl1, bl2, bl3, bl4, bl5, bl6, bl7,
          th, tl, i, j, h, l, a, b, c, d;

      var ah0 = hh[0],
          ah1 = hh[1],
          ah2 = hh[2],
          ah3 = hh[3],
          ah4 = hh[4],
          ah5 = hh[5],
          ah6 = hh[6],
          ah7 = hh[7],

          al0 = hl[0],
          al1 = hl[1],
          al2 = hl[2],
          al3 = hl[3],
          al4 = hl[4],
          al5 = hl[5],
          al6 = hl[6],
          al7 = hl[7];

      var pos = 0;
      while (n >= 128) {
        for (i = 0; i < 16; i++) {
          j = 8 * i + pos;
          wh[i] = (m[j+0] << 24) | (m[j+1] << 16) | (m[j+2] << 8) | m[j+3];
          wl[i] = (m[j+4] << 24) | (m[j+5] << 16) | (m[j+6] << 8) | m[j+7];
        }
        for (i = 0; i < 80; i++) {
          bh0 = ah0;
          bh1 = ah1;
          bh2 = ah2;
          bh3 = ah3;
          bh4 = ah4;
          bh5 = ah5;
          bh6 = ah6;
          bh7 = ah7;

          bl0 = al0;
          bl1 = al1;
          bl2 = al2;
          bl3 = al3;
          bl4 = al4;
          bl5 = al5;
          bl6 = al6;
          bl7 = al7;

          // add
          h = ah7;
          l = al7;

          a = l & 0xffff; b = l >>> 16;
          c = h & 0xffff; d = h >>> 16;

          // Sigma1
          h = ((ah4 >>> 14) | (al4 << (32-14))) ^ ((ah4 >>> 18) | (al4 << (32-18))) ^ ((al4 >>> (41-32)) | (ah4 << (32-(41-32))));
          l = ((al4 >>> 14) | (ah4 << (32-14))) ^ ((al4 >>> 18) | (ah4 << (32-18))) ^ ((ah4 >>> (41-32)) | (al4 << (32-(41-32))));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // Ch
          h = (ah4 & ah5) ^ (~ah4 & ah6);
          l = (al4 & al5) ^ (~al4 & al6);

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // K
          h = K[i*2];
          l = K[i*2+1];

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // w
          h = wh[i%16];
          l = wl[i%16];

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          th = c & 0xffff | d << 16;
          tl = a & 0xffff | b << 16;

          // add
          h = th;
          l = tl;

          a = l & 0xffff; b = l >>> 16;
          c = h & 0xffff; d = h >>> 16;

          // Sigma0
          h = ((ah0 >>> 28) | (al0 << (32-28))) ^ ((al0 >>> (34-32)) | (ah0 << (32-(34-32)))) ^ ((al0 >>> (39-32)) | (ah0 << (32-(39-32))));
          l = ((al0 >>> 28) | (ah0 << (32-28))) ^ ((ah0 >>> (34-32)) | (al0 << (32-(34-32)))) ^ ((ah0 >>> (39-32)) | (al0 << (32-(39-32))));

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          // Maj
          h = (ah0 & ah1) ^ (ah0 & ah2) ^ (ah1 & ah2);
          l = (al0 & al1) ^ (al0 & al2) ^ (al1 & al2);

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          bh7 = (c & 0xffff) | (d << 16);
          bl7 = (a & 0xffff) | (b << 16);

          // add
          h = bh3;
          l = bl3;

          a = l & 0xffff; b = l >>> 16;
          c = h & 0xffff; d = h >>> 16;

          h = th;
          l = tl;

          a += l & 0xffff; b += l >>> 16;
          c += h & 0xffff; d += h >>> 16;

          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;

          bh3 = (c & 0xffff) | (d << 16);
          bl3 = (a & 0xffff) | (b << 16);

          ah1 = bh0;
          ah2 = bh1;
          ah3 = bh2;
          ah4 = bh3;
          ah5 = bh4;
          ah6 = bh5;
          ah7 = bh6;
          ah0 = bh7;

          al1 = bl0;
          al2 = bl1;
          al3 = bl2;
          al4 = bl3;
          al5 = bl4;
          al6 = bl5;
          al7 = bl6;
          al0 = bl7;

          if (i%16 === 15) {
            for (j = 0; j < 16; j++) {
              // add
              h = wh[j];
              l = wl[j];

              a = l & 0xffff; b = l >>> 16;
              c = h & 0xffff; d = h >>> 16;

              h = wh[(j+9)%16];
              l = wl[(j+9)%16];

              a += l & 0xffff; b += l >>> 16;
              c += h & 0xffff; d += h >>> 16;

              // sigma0
              th = wh[(j+1)%16];
              tl = wl[(j+1)%16];
              h = ((th >>> 1) | (tl << (32-1))) ^ ((th >>> 8) | (tl << (32-8))) ^ (th >>> 7);
              l = ((tl >>> 1) | (th << (32-1))) ^ ((tl >>> 8) | (th << (32-8))) ^ ((tl >>> 7) | (th << (32-7)));

              a += l & 0xffff; b += l >>> 16;
              c += h & 0xffff; d += h >>> 16;

              // sigma1
              th = wh[(j+14)%16];
              tl = wl[(j+14)%16];
              h = ((th >>> 19) | (tl << (32-19))) ^ ((tl >>> (61-32)) | (th << (32-(61-32)))) ^ (th >>> 6);
              l = ((tl >>> 19) | (th << (32-19))) ^ ((th >>> (61-32)) | (tl << (32-(61-32)))) ^ ((tl >>> 6) | (th << (32-6)));

              a += l & 0xffff; b += l >>> 16;
              c += h & 0xffff; d += h >>> 16;

              b += a >>> 16;
              c += b >>> 16;
              d += c >>> 16;

              wh[j] = (c & 0xffff) | (d << 16);
              wl[j] = (a & 0xffff) | (b << 16);
            }
          }
        }

        // add
        h = ah0;
        l = al0;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[0];
        l = hl[0];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[0] = ah0 = (c & 0xffff) | (d << 16);
        hl[0] = al0 = (a & 0xffff) | (b << 16);

        h = ah1;
        l = al1;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[1];
        l = hl[1];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[1] = ah1 = (c & 0xffff) | (d << 16);
        hl[1] = al1 = (a & 0xffff) | (b << 16);

        h = ah2;
        l = al2;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[2];
        l = hl[2];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[2] = ah2 = (c & 0xffff) | (d << 16);
        hl[2] = al2 = (a & 0xffff) | (b << 16);

        h = ah3;
        l = al3;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[3];
        l = hl[3];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[3] = ah3 = (c & 0xffff) | (d << 16);
        hl[3] = al3 = (a & 0xffff) | (b << 16);

        h = ah4;
        l = al4;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[4];
        l = hl[4];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[4] = ah4 = (c & 0xffff) | (d << 16);
        hl[4] = al4 = (a & 0xffff) | (b << 16);

        h = ah5;
        l = al5;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[5];
        l = hl[5];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[5] = ah5 = (c & 0xffff) | (d << 16);
        hl[5] = al5 = (a & 0xffff) | (b << 16);

        h = ah6;
        l = al6;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[6];
        l = hl[6];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[6] = ah6 = (c & 0xffff) | (d << 16);
        hl[6] = al6 = (a & 0xffff) | (b << 16);

        h = ah7;
        l = al7;

        a = l & 0xffff; b = l >>> 16;
        c = h & 0xffff; d = h >>> 16;

        h = hh[7];
        l = hl[7];

        a += l & 0xffff; b += l >>> 16;
        c += h & 0xffff; d += h >>> 16;

        b += a >>> 16;
        c += b >>> 16;
        d += c >>> 16;

        hh[7] = ah7 = (c & 0xffff) | (d << 16);
        hl[7] = al7 = (a & 0xffff) | (b << 16);

        pos += 128;
        n -= 128;
      }

      return n;
    }

    function crypto_hash(out, m, n) {
      var hh = new Int32Array(8),
          hl = new Int32Array(8),
          x = new Uint8Array(256),
          i, b = n;

      hh[0] = 0x6a09e667;
      hh[1] = 0xbb67ae85;
      hh[2] = 0x3c6ef372;
      hh[3] = 0xa54ff53a;
      hh[4] = 0x510e527f;
      hh[5] = 0x9b05688c;
      hh[6] = 0x1f83d9ab;
      hh[7] = 0x5be0cd19;

      hl[0] = 0xf3bcc908;
      hl[1] = 0x84caa73b;
      hl[2] = 0xfe94f82b;
      hl[3] = 0x5f1d36f1;
      hl[4] = 0xade682d1;
      hl[5] = 0x2b3e6c1f;
      hl[6] = 0xfb41bd6b;
      hl[7] = 0x137e2179;

      crypto_hashblocks_hl(hh, hl, m, n);
      n %= 128;

      for (i = 0; i < n; i++) x[i] = m[b-n+i];
      x[n] = 128;

      n = 256-128*(n<112?1:0);
      x[n-9] = 0;
      ts64(x, n-8,  (b / 0x20000000) | 0, b << 3);
      crypto_hashblocks_hl(hh, hl, x, n);

      for (i = 0; i < 8; i++) ts64(out, 8*i, hh[i], hl[i]);

      return 0;
    }

    function add(p, q) {
      var a = gf(), b = gf(), c = gf(),
          d = gf(), e = gf(), f = gf(),
          g = gf(), h = gf(), t = gf();

      Z(a, p[1], p[0]);
      Z(t, q[1], q[0]);
      M(a, a, t);
      A(b, p[0], p[1]);
      A(t, q[0], q[1]);
      M(b, b, t);
      M(c, p[3], q[3]);
      M(c, c, D2);
      M(d, p[2], q[2]);
      A(d, d, d);
      Z(e, b, a);
      Z(f, d, c);
      A(g, d, c);
      A(h, b, a);

      M(p[0], e, f);
      M(p[1], h, g);
      M(p[2], g, f);
      M(p[3], e, h);
    }

    function cswap(p, q, b) {
      var i;
      for (i = 0; i < 4; i++) {
        sel25519(p[i], q[i], b);
      }
    }

    function pack(r, p) {
      var tx = gf(), ty = gf(), zi = gf();
      inv25519(zi, p[2]);
      M(tx, p[0], zi);
      M(ty, p[1], zi);
      pack25519(r, ty);
      r[31] ^= par25519(tx) << 7;
    }

    function scalarmult(p, q, s) {
      var b, i;
      set25519(p[0], gf0);
      set25519(p[1], gf1);
      set25519(p[2], gf1);
      set25519(p[3], gf0);
      for (i = 255; i >= 0; --i) {
        b = (s[(i/8)|0] >> (i&7)) & 1;
        cswap(p, q, b);
        add(q, p);
        add(p, p);
        cswap(p, q, b);
      }
    }

    function scalarbase(p, s) {
      var q = [gf(), gf(), gf(), gf()];
      set25519(q[0], X);
      set25519(q[1], Y);
      set25519(q[2], gf1);
      M(q[3], X, Y);
      scalarmult(p, q, s);
    }

    function crypto_sign_keypair(pk, sk, seeded) {
      var d = new Uint8Array(64);
      var p = [gf(), gf(), gf(), gf()];
      var i;

      if (!seeded) randombytes(sk, 32);
      crypto_hash(d, sk, 32);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;

      scalarbase(p, d);
      pack(pk, p);

      for (i = 0; i < 32; i++) sk[i+32] = pk[i];
      return 0;
    }

    var L = new Float64Array([0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10]);

    function modL(r, x) {
      var carry, i, j, k;
      for (i = 63; i >= 32; --i) {
        carry = 0;
        for (j = i - 32, k = i - 12; j < k; ++j) {
          x[j] += carry - 16 * x[i] * L[j - (i - 32)];
          carry = (x[j] + 128) >> 8;
          x[j] -= carry * 256;
        }
        x[j] += carry;
        x[i] = 0;
      }
      carry = 0;
      for (j = 0; j < 32; j++) {
        x[j] += carry - (x[31] >> 4) * L[j];
        carry = x[j] >> 8;
        x[j] &= 255;
      }
      for (j = 0; j < 32; j++) x[j] -= carry * L[j];
      for (i = 0; i < 32; i++) {
        x[i+1] += x[i] >> 8;
        r[i] = x[i] & 255;
      }
    }

    function reduce(r) {
      var x = new Float64Array(64), i;
      for (i = 0; i < 64; i++) x[i] = r[i];
      for (i = 0; i < 64; i++) r[i] = 0;
      modL(r, x);
    }

    // Note: difference from C - smlen returned, not passed as argument.
    function crypto_sign(sm, m, n, sk) {
      var d = new Uint8Array(64), h = new Uint8Array(64), r = new Uint8Array(64);
      var i, j, x = new Float64Array(64);
      var p = [gf(), gf(), gf(), gf()];

      crypto_hash(d, sk, 32);
      d[0] &= 248;
      d[31] &= 127;
      d[31] |= 64;

      var smlen = n + 64;
      for (i = 0; i < n; i++) sm[64 + i] = m[i];
      for (i = 0; i < 32; i++) sm[32 + i] = d[32 + i];

      crypto_hash(r, sm.subarray(32), n+32);
      reduce(r);
      scalarbase(p, r);
      pack(sm, p);

      for (i = 32; i < 64; i++) sm[i] = sk[i];
      crypto_hash(h, sm, n + 64);
      reduce(h);

      for (i = 0; i < 64; i++) x[i] = 0;
      for (i = 0; i < 32; i++) x[i] = r[i];
      for (i = 0; i < 32; i++) {
        for (j = 0; j < 32; j++) {
          x[i+j] += h[i] * d[j];
        }
      }

      modL(sm.subarray(32), x);
      return smlen;
    }

    function unpackneg(r, p) {
      var t = gf(), chk = gf(), num = gf(),
          den = gf(), den2 = gf(), den4 = gf(),
          den6 = gf();

      set25519(r[2], gf1);
      unpack25519(r[1], p);
      S(num, r[1]);
      M(den, num, D);
      Z(num, num, r[2]);
      A(den, r[2], den);

      S(den2, den);
      S(den4, den2);
      M(den6, den4, den2);
      M(t, den6, num);
      M(t, t, den);

      pow2523(t, t);
      M(t, t, num);
      M(t, t, den);
      M(t, t, den);
      M(r[0], t, den);

      S(chk, r[0]);
      M(chk, chk, den);
      if (neq25519(chk, num)) M(r[0], r[0], I);

      S(chk, r[0]);
      M(chk, chk, den);
      if (neq25519(chk, num)) return -1;

      if (par25519(r[0]) === (p[31]>>7)) Z(r[0], gf0, r[0]);

      M(r[3], r[0], r[1]);
      return 0;
    }

    function crypto_sign_open(m, sm, n, pk) {
      var i, mlen;
      var t = new Uint8Array(32), h = new Uint8Array(64);
      var p = [gf(), gf(), gf(), gf()],
          q = [gf(), gf(), gf(), gf()];

      mlen = -1;
      if (n < 64) return -1;

      if (unpackneg(q, pk)) return -1;

      for (i = 0; i < n; i++) m[i] = sm[i];
      for (i = 0; i < 32; i++) m[i+32] = pk[i];
      crypto_hash(h, m, n);
      reduce(h);
      scalarmult(p, q, h);

      scalarbase(q, sm.subarray(32));
      add(p, q);
      pack(t, p);

      n -= 64;
      if (crypto_verify_32(sm, 0, t, 0)) {
        for (i = 0; i < n; i++) m[i] = 0;
        return -1;
      }

      for (i = 0; i < n; i++) m[i] = sm[i + 64];
      mlen = n;
      return mlen;
    }

    var crypto_secretbox_KEYBYTES = 32,
        crypto_secretbox_NONCEBYTES = 24,
        crypto_secretbox_ZEROBYTES = 32,
        crypto_secretbox_BOXZEROBYTES = 16,
        crypto_scalarmult_BYTES = 32,
        crypto_scalarmult_SCALARBYTES = 32,
        crypto_box_PUBLICKEYBYTES = 32,
        crypto_box_SECRETKEYBYTES = 32,
        crypto_box_BEFORENMBYTES = 32,
        crypto_box_NONCEBYTES = crypto_secretbox_NONCEBYTES,
        crypto_box_ZEROBYTES = crypto_secretbox_ZEROBYTES,
        crypto_box_BOXZEROBYTES = crypto_secretbox_BOXZEROBYTES,
        crypto_sign_BYTES = 64,
        crypto_sign_PUBLICKEYBYTES = 32,
        crypto_sign_SECRETKEYBYTES = 64,
        crypto_sign_SEEDBYTES = 32,
        crypto_hash_BYTES = 64;

    nacl.lowlevel = {
      crypto_core_hsalsa20: crypto_core_hsalsa20,
      crypto_stream_xor: crypto_stream_xor,
      crypto_stream: crypto_stream,
      crypto_stream_salsa20_xor: crypto_stream_salsa20_xor,
      crypto_stream_salsa20: crypto_stream_salsa20,
      crypto_onetimeauth: crypto_onetimeauth,
      crypto_onetimeauth_verify: crypto_onetimeauth_verify,
      crypto_verify_16: crypto_verify_16,
      crypto_verify_32: crypto_verify_32,
      crypto_secretbox: crypto_secretbox,
      crypto_secretbox_open: crypto_secretbox_open,
      crypto_scalarmult: crypto_scalarmult,
      crypto_scalarmult_base: crypto_scalarmult_base,
      crypto_box_beforenm: crypto_box_beforenm,
      crypto_box_afternm: crypto_box_afternm,
      crypto_box: crypto_box,
      crypto_box_open: crypto_box_open,
      crypto_box_keypair: crypto_box_keypair,
      crypto_hash: crypto_hash,
      crypto_sign: crypto_sign,
      crypto_sign_keypair: crypto_sign_keypair,
      crypto_sign_open: crypto_sign_open,

      crypto_secretbox_KEYBYTES: crypto_secretbox_KEYBYTES,
      crypto_secretbox_NONCEBYTES: crypto_secretbox_NONCEBYTES,
      crypto_secretbox_ZEROBYTES: crypto_secretbox_ZEROBYTES,
      crypto_secretbox_BOXZEROBYTES: crypto_secretbox_BOXZEROBYTES,
      crypto_scalarmult_BYTES: crypto_scalarmult_BYTES,
      crypto_scalarmult_SCALARBYTES: crypto_scalarmult_SCALARBYTES,
      crypto_box_PUBLICKEYBYTES: crypto_box_PUBLICKEYBYTES,
      crypto_box_SECRETKEYBYTES: crypto_box_SECRETKEYBYTES,
      crypto_box_BEFORENMBYTES: crypto_box_BEFORENMBYTES,
      crypto_box_NONCEBYTES: crypto_box_NONCEBYTES,
      crypto_box_ZEROBYTES: crypto_box_ZEROBYTES,
      crypto_box_BOXZEROBYTES: crypto_box_BOXZEROBYTES,
      crypto_sign_BYTES: crypto_sign_BYTES,
      crypto_sign_PUBLICKEYBYTES: crypto_sign_PUBLICKEYBYTES,
      crypto_sign_SECRETKEYBYTES: crypto_sign_SECRETKEYBYTES,
      crypto_sign_SEEDBYTES: crypto_sign_SEEDBYTES,
      crypto_hash_BYTES: crypto_hash_BYTES
    };

    /* High-level API */

    function checkLengths(k, n) {
      if (k.length !== crypto_secretbox_KEYBYTES) throw new Error('bad key size');
      if (n.length !== crypto_secretbox_NONCEBYTES) throw new Error('bad nonce size');
    }

    function checkBoxLengths(pk, sk) {
      if (pk.length !== crypto_box_PUBLICKEYBYTES) throw new Error('bad public key size');
      if (sk.length !== crypto_box_SECRETKEYBYTES) throw new Error('bad secret key size');
    }

    function checkArrayTypes() {
      for (var i = 0; i < arguments.length; i++) {
        if (!(arguments[i] instanceof Uint8Array))
          throw new TypeError('unexpected type, use Uint8Array');
      }
    }

    function cleanup(arr) {
      for (var i = 0; i < arr.length; i++) arr[i] = 0;
    }

    nacl.randomBytes = function(n) {
      var b = new Uint8Array(n);
      randombytes(b, n);
      return b;
    };

    nacl.secretbox = function(msg, nonce, key) {
      checkArrayTypes(msg, nonce, key);
      checkLengths(key, nonce);
      var m = new Uint8Array(crypto_secretbox_ZEROBYTES + msg.length);
      var c = new Uint8Array(m.length);
      for (var i = 0; i < msg.length; i++) m[i+crypto_secretbox_ZEROBYTES] = msg[i];
      crypto_secretbox(c, m, m.length, nonce, key);
      return c.subarray(crypto_secretbox_BOXZEROBYTES);
    };

    nacl.secretbox.open = function(box, nonce, key) {
      checkArrayTypes(box, nonce, key);
      checkLengths(key, nonce);
      var c = new Uint8Array(crypto_secretbox_BOXZEROBYTES + box.length);
      var m = new Uint8Array(c.length);
      for (var i = 0; i < box.length; i++) c[i+crypto_secretbox_BOXZEROBYTES] = box[i];
      if (c.length < 32) return null;
      if (crypto_secretbox_open(m, c, c.length, nonce, key) !== 0) return null;
      return m.subarray(crypto_secretbox_ZEROBYTES);
    };

    nacl.secretbox.keyLength = crypto_secretbox_KEYBYTES;
    nacl.secretbox.nonceLength = crypto_secretbox_NONCEBYTES;
    nacl.secretbox.overheadLength = crypto_secretbox_BOXZEROBYTES;

    nacl.scalarMult = function(n, p) {
      checkArrayTypes(n, p);
      if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
      if (p.length !== crypto_scalarmult_BYTES) throw new Error('bad p size');
      var q = new Uint8Array(crypto_scalarmult_BYTES);
      crypto_scalarmult(q, n, p);
      return q;
    };

    nacl.scalarMult.base = function(n) {
      checkArrayTypes(n);
      if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error('bad n size');
      var q = new Uint8Array(crypto_scalarmult_BYTES);
      crypto_scalarmult_base(q, n);
      return q;
    };

    nacl.scalarMult.scalarLength = crypto_scalarmult_SCALARBYTES;
    nacl.scalarMult.groupElementLength = crypto_scalarmult_BYTES;

    nacl.box = function(msg, nonce, publicKey, secretKey) {
      var k = nacl.box.before(publicKey, secretKey);
      return nacl.secretbox(msg, nonce, k);
    };

    nacl.box.before = function(publicKey, secretKey) {
      checkArrayTypes(publicKey, secretKey);
      checkBoxLengths(publicKey, secretKey);
      var k = new Uint8Array(crypto_box_BEFORENMBYTES);
      crypto_box_beforenm(k, publicKey, secretKey);
      return k;
    };

    nacl.box.after = nacl.secretbox;

    nacl.box.open = function(msg, nonce, publicKey, secretKey) {
      var k = nacl.box.before(publicKey, secretKey);
      return nacl.secretbox.open(msg, nonce, k);
    };

    nacl.box.open.after = nacl.secretbox.open;

    nacl.box.keyPair = function() {
      var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_box_SECRETKEYBYTES);
      crypto_box_keypair(pk, sk);
      return {publicKey: pk, secretKey: sk};
    };

    nacl.box.keyPair.fromSecretKey = function(secretKey) {
      checkArrayTypes(secretKey);
      if (secretKey.length !== crypto_box_SECRETKEYBYTES)
        throw new Error('bad secret key size');
      var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
      crypto_scalarmult_base(pk, secretKey);
      return {publicKey: pk, secretKey: new Uint8Array(secretKey)};
    };

    nacl.box.publicKeyLength = crypto_box_PUBLICKEYBYTES;
    nacl.box.secretKeyLength = crypto_box_SECRETKEYBYTES;
    nacl.box.sharedKeyLength = crypto_box_BEFORENMBYTES;
    nacl.box.nonceLength = crypto_box_NONCEBYTES;
    nacl.box.overheadLength = nacl.secretbox.overheadLength;

    nacl.sign = function(msg, secretKey) {
      checkArrayTypes(msg, secretKey);
      if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
        throw new Error('bad secret key size');
      var signedMsg = new Uint8Array(crypto_sign_BYTES+msg.length);
      crypto_sign(signedMsg, msg, msg.length, secretKey);
      return signedMsg;
    };

    nacl.sign.open = function(signedMsg, publicKey) {
      checkArrayTypes(signedMsg, publicKey);
      if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
        throw new Error('bad public key size');
      var tmp = new Uint8Array(signedMsg.length);
      var mlen = crypto_sign_open(tmp, signedMsg, signedMsg.length, publicKey);
      if (mlen < 0) return null;
      var m = new Uint8Array(mlen);
      for (var i = 0; i < m.length; i++) m[i] = tmp[i];
      return m;
    };

    nacl.sign.detached = function(msg, secretKey) {
      var signedMsg = nacl.sign(msg, secretKey);
      var sig = new Uint8Array(crypto_sign_BYTES);
      for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
      return sig;
    };

    nacl.sign.detached.verify = function(msg, sig, publicKey) {
      checkArrayTypes(msg, sig, publicKey);
      if (sig.length !== crypto_sign_BYTES)
        throw new Error('bad signature size');
      if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
        throw new Error('bad public key size');
      var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
      var m = new Uint8Array(crypto_sign_BYTES + msg.length);
      var i;
      for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
      for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];
      return (crypto_sign_open(m, sm, sm.length, publicKey) >= 0);
    };

    nacl.sign.keyPair = function() {
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
      crypto_sign_keypair(pk, sk);
      return {publicKey: pk, secretKey: sk};
    };

    nacl.sign.keyPair.fromSecretKey = function(secretKey) {
      checkArrayTypes(secretKey);
      if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
        throw new Error('bad secret key size');
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      for (var i = 0; i < pk.length; i++) pk[i] = secretKey[32+i];
      return {publicKey: pk, secretKey: new Uint8Array(secretKey)};
    };

    nacl.sign.keyPair.fromSeed = function(seed) {
      checkArrayTypes(seed);
      if (seed.length !== crypto_sign_SEEDBYTES)
        throw new Error('bad seed size');
      var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
      var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
      for (var i = 0; i < 32; i++) sk[i] = seed[i];
      crypto_sign_keypair(pk, sk, true);
      return {publicKey: pk, secretKey: sk};
    };

    nacl.sign.publicKeyLength = crypto_sign_PUBLICKEYBYTES;
    nacl.sign.secretKeyLength = crypto_sign_SECRETKEYBYTES;
    nacl.sign.seedLength = crypto_sign_SEEDBYTES;
    nacl.sign.signatureLength = crypto_sign_BYTES;

    nacl.hash = function(msg) {
      checkArrayTypes(msg);
      var h = new Uint8Array(crypto_hash_BYTES);
      crypto_hash(h, msg, msg.length);
      return h;
    };

    nacl.hash.hashLength = crypto_hash_BYTES;

    nacl.verify = function(x, y) {
      checkArrayTypes(x, y);
      // Zero length arguments are considered not equal.
      if (x.length === 0 || y.length === 0) return false;
      if (x.length !== y.length) return false;
      return (vn(x, 0, y, 0, x.length) === 0) ? true : false;
    };

    nacl.setPRNG = function(fn) {
      randombytes = fn;
    };

    (function() {
      // Initialize PRNG if environment provides CSPRNG.
      // If not, methods calling randombytes will throw.
      var crypto = typeof self !== 'undefined' ? (self.crypto || self.msCrypto) : null;
      if (crypto && crypto.getRandomValues) {
        // Browsers.
        var QUOTA = 65536;
        nacl.setPRNG(function(x, n) {
          var i, v = new Uint8Array(n);
          for (i = 0; i < n; i += QUOTA) {
            crypto.getRandomValues(v.subarray(i, i + Math.min(n - i, QUOTA)));
          }
          for (i = 0; i < n; i++) x[i] = v[i];
          cleanup(v);
        });
      } else {
        // Node.js.
        crypto = __webpack_require__(3);
        if (crypto && crypto.randomBytes) {
          nacl.setPRNG(function(x, n) {
            var i, v = crypto.randomBytes(n);
            for (i = 0; i < n; i++) x[i] = v[i];
            cleanup(v);
          });
        }
      }
    })();

    })(  module.exports ? module.exports : (self.nacl = self.nacl || {}));


    /***/ }),
    /* 1 */
    /***/ (function(module, exports, __webpack_require__) {

    // Written in 2014-2016 by Dmitry Chestnykh and Devi Mandiri.
    // Public domain.
    (function(root, f) {
      if (  module.exports) module.exports = f();
      else if (root.nacl) root.nacl.util = f();
      else {
        root.nacl = {};
        root.nacl.util = f();
      }
    }(this, function() {

      var util = {};

      function validateBase64(s) {
        if (!(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))) {
          throw new TypeError('invalid encoding');
        }
      }

      util.decodeUTF8 = function(s) {
        if (typeof s !== 'string') throw new TypeError('expected string');
        var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
        for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
        return b;
      };

      util.encodeUTF8 = function(arr) {
        var i, s = [];
        for (i = 0; i < arr.length; i++) s.push(String.fromCharCode(arr[i]));
        return decodeURIComponent(escape(s.join('')));
      };

      if (typeof atob === 'undefined') {
        // Node.js

        if (typeof Buffer.from !== 'undefined') {
           // Node v6 and later
          util.encodeBase64 = function (arr) { // v6 and later
              return Buffer.from(arr).toString('base64');
          };

          util.decodeBase64 = function (s) {
            validateBase64(s);
            return new Uint8Array(Array.prototype.slice.call(Buffer.from(s, 'base64'), 0));
          };

        } else {
          // Node earlier than v6
          util.encodeBase64 = function (arr) { // v6 and later
            return (new Buffer(arr)).toString('base64');
          };

          util.decodeBase64 = function(s) {
            validateBase64(s);
            return new Uint8Array(Array.prototype.slice.call(new Buffer(s, 'base64'), 0));
          };
        }

      } else {
        // Browsers

        util.encodeBase64 = function(arr) {
          var i, s = [], len = arr.length;
          for (i = 0; i < len; i++) s.push(String.fromCharCode(arr[i]));
          return btoa(s.join(''));
        };

        util.decodeBase64 = function(s) {
          validateBase64(s);
          var i, d = atob(s), b = new Uint8Array(d.length);
          for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
          return b;
        };

      }

      return util;

    }));


    /***/ }),
    /* 2 */
    /***/ (function(module, exports, __webpack_require__) {

    // required so we don't have to do require('pusher').default etc.
    module.exports = __webpack_require__(4).default;


    /***/ }),
    /* 3 */
    /***/ (function(module, exports) {

    /* (ignored) */

    /***/ }),
    /* 4 */
    /***/ (function(module, __webpack_exports__, __webpack_require__) {
    __webpack_require__.r(__webpack_exports__);

    // CONCATENATED MODULE: ./src/runtimes/web/dom/script_receiver_factory.ts
    var ScriptReceiverFactory = (function () {
        function ScriptReceiverFactory(prefix, name) {
            this.lastId = 0;
            this.prefix = prefix;
            this.name = name;
        }
        ScriptReceiverFactory.prototype.create = function (callback) {
            this.lastId++;
            var number = this.lastId;
            var id = this.prefix + number;
            var name = this.name + "[" + number + "]";
            var called = false;
            var callbackWrapper = function () {
                if (!called) {
                    callback.apply(null, arguments);
                    called = true;
                }
            };
            this[number] = callbackWrapper;
            return { number: number, id: id, name: name, callback: callbackWrapper };
        };
        ScriptReceiverFactory.prototype.remove = function (receiver) {
            delete this[receiver.number];
        };
        return ScriptReceiverFactory;
    }());

    var ScriptReceivers = new ScriptReceiverFactory("_pusher_script_", "Pusher.ScriptReceivers");

    // CONCATENATED MODULE: ./src/core/defaults.ts
    var Defaults = {
        VERSION: "5.0.2",
        PROTOCOL: 7,
        host: 'ws.pusherapp.com',
        ws_port: 80,
        wss_port: 443,
        ws_path: '',
        sockjs_host: 'sockjs.pusher.com',
        sockjs_http_port: 80,
        sockjs_https_port: 443,
        sockjs_path: '/pusher',
        stats_host: 'stats.pusher.com',
        channel_auth_endpoint: '/pusher/auth',
        channel_auth_transport: 'ajax',
        activity_timeout: 120000,
        pong_timeout: 30000,
        unavailable_timeout: 10000,
        cdn_http: "http://js.pusher.com",
        cdn_https: "https://js.pusher.com",
        dependency_suffix: ""
    };
    /* harmony default export */ var defaults = (Defaults);

    // CONCATENATED MODULE: ./src/runtimes/web/dom/dependency_loader.ts


    var dependency_loader_DependencyLoader = (function () {
        function DependencyLoader(options) {
            this.options = options;
            this.receivers = options.receivers || ScriptReceivers;
            this.loading = {};
        }
        DependencyLoader.prototype.load = function (name, options, callback) {
            var self = this;
            if (self.loading[name] && self.loading[name].length > 0) {
                self.loading[name].push(callback);
            }
            else {
                self.loading[name] = [callback];
                var request = runtime.createScriptRequest(self.getPath(name, options));
                var receiver = self.receivers.create(function (error) {
                    self.receivers.remove(receiver);
                    if (self.loading[name]) {
                        var callbacks = self.loading[name];
                        delete self.loading[name];
                        var successCallback = function (wasSuccessful) {
                            if (!wasSuccessful) {
                                request.cleanup();
                            }
                        };
                        for (var i = 0; i < callbacks.length; i++) {
                            callbacks[i](error, successCallback);
                        }
                    }
                });
                request.send(receiver);
            }
        };
        DependencyLoader.prototype.getRoot = function (options) {
            var cdn;
            var protocol = runtime.getDocument().location.protocol;
            if ((options && options.useTLS) || protocol === "https:") {
                cdn = this.options.cdn_https;
            }
            else {
                cdn = this.options.cdn_http;
            }
            return cdn.replace(/\/*$/, "") + "/" + this.options.version;
        };
        DependencyLoader.prototype.getPath = function (name, options) {
            return this.getRoot(options) + '/' + name + this.options.suffix + '.js';
        };
        return DependencyLoader;
    }());
    /* harmony default export */ var dependency_loader = (dependency_loader_DependencyLoader);

    // CONCATENATED MODULE: ./src/runtimes/web/dom/dependencies.ts



    var DependenciesReceivers = new ScriptReceiverFactory("_pusher_dependencies", "Pusher.DependenciesReceivers");
    var Dependencies = new dependency_loader({
        cdn_http: defaults.cdn_http,
        cdn_https: defaults.cdn_https,
        version: defaults.VERSION,
        suffix: defaults.dependency_suffix,
        receivers: DependenciesReceivers
    });

    // CONCATENATED MODULE: ./src/core/base64.ts
    function encode(s) {
        return btoa(utob(s));
    }
    var fromCharCode = String.fromCharCode;
    var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var cb_utob = function (c) {
        var cc = c.charCodeAt(0);
        return cc < 0x80
            ? c
            : cc < 0x800
                ? fromCharCode(0xc0 | (cc >>> 6)) + fromCharCode(0x80 | (cc & 0x3f))
                : fromCharCode(0xe0 | ((cc >>> 12) & 0x0f)) +
                    fromCharCode(0x80 | ((cc >>> 6) & 0x3f)) +
                    fromCharCode(0x80 | (cc & 0x3f));
    };
    var utob = function (u) {
        return u.replace(/[^\x00-\x7F]/g, cb_utob);
    };
    var cb_encode = function (ccc) {
        var padlen = [0, 2, 1][ccc.length % 3];
        var ord = (ccc.charCodeAt(0) << 16) |
            ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8) |
            (ccc.length > 2 ? ccc.charCodeAt(2) : 0);
        var chars = [
            b64chars.charAt(ord >>> 18),
            b64chars.charAt((ord >>> 12) & 63),
            padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
            padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
        ];
        return chars.join('');
    };
    var btoa = window.btoa ||
        function (b) {
            return b.replace(/[\s\S]{1,3}/g, cb_encode);
        };

    // CONCATENATED MODULE: ./src/core/utils/timers/abstract_timer.ts
    var Timer = (function () {
        function Timer(set, clear, delay, callback) {
            var _this = this;
            this.clear = clear;
            this.timer = set(function () {
                if (_this.timer) {
                    _this.timer = callback(_this.timer);
                }
            }, delay);
        }
        Timer.prototype.isRunning = function () {
            return this.timer !== null;
        };
        Timer.prototype.ensureAborted = function () {
            if (this.timer) {
                this.clear(this.timer);
                this.timer = null;
            }
        };
        return Timer;
    }());
    /* harmony default export */ var abstract_timer = (Timer);

    // CONCATENATED MODULE: ./src/core/utils/timers/index.ts
    var __extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();

    function timers_clearTimeout(timer) {
        window.clearTimeout(timer);
    }
    function timers_clearInterval(timer) {
        window.clearInterval(timer);
    }
    var OneOffTimer = (function (_super) {
        __extends(OneOffTimer, _super);
        function OneOffTimer(delay, callback) {
            return _super.call(this, setTimeout, timers_clearTimeout, delay, function (timer) {
                callback();
                return null;
            }) || this;
        }
        return OneOffTimer;
    }(abstract_timer));

    var PeriodicTimer = (function (_super) {
        __extends(PeriodicTimer, _super);
        function PeriodicTimer(delay, callback) {
            return _super.call(this, setInterval, timers_clearInterval, delay, function (timer) {
                callback();
                return timer;
            }) || this;
        }
        return PeriodicTimer;
    }(abstract_timer));


    // CONCATENATED MODULE: ./src/core/util.ts

    var Util = {
        now: function () {
            if (Date.now) {
                return Date.now();
            }
            else {
                return new Date().valueOf();
            }
        },
        defer: function (callback) {
            return new OneOffTimer(0, callback);
        },
        method: function (name) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var boundArguments = Array.prototype.slice.call(arguments, 1);
            return function (object) {
                return object[name].apply(object, boundArguments.concat(arguments));
            };
        }
    };
    /* harmony default export */ var util = (Util);

    // CONCATENATED MODULE: ./src/core/utils/collections.ts


    function extend(target) {
        var sources = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            sources[_i - 1] = arguments[_i];
        }
        for (var i = 0; i < sources.length; i++) {
            var extensions = sources[i];
            for (var property in extensions) {
                if (extensions[property] && extensions[property].constructor &&
                    extensions[property].constructor === Object) {
                    target[property] = extend(target[property] || {}, extensions[property]);
                }
                else {
                    target[property] = extensions[property];
                }
            }
        }
        return target;
    }
    function stringify() {
        var m = ["Pusher"];
        for (var i = 0; i < arguments.length; i++) {
            if (typeof arguments[i] === "string") {
                m.push(arguments[i]);
            }
            else {
                m.push(safeJSONStringify(arguments[i]));
            }
        }
        return m.join(" : ");
    }
    function arrayIndexOf(array, item) {
        var nativeIndexOf = Array.prototype.indexOf;
        if (array === null) {
            return -1;
        }
        if (nativeIndexOf && array.indexOf === nativeIndexOf) {
            return array.indexOf(item);
        }
        for (var i = 0, l = array.length; i < l; i++) {
            if (array[i] === item) {
                return i;
            }
        }
        return -1;
    }
    function objectApply(object, f) {
        for (var key in object) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
                f(object[key], key, object);
            }
        }
    }
    function keys(object) {
        var keys = [];
        objectApply(object, function (_, key) {
            keys.push(key);
        });
        return keys;
    }
    function values(object) {
        var values = [];
        objectApply(object, function (value) {
            values.push(value);
        });
        return values;
    }
    function apply(array, f, context) {
        for (var i = 0; i < array.length; i++) {
            f.call(context || window, array[i], i, array);
        }
    }
    function map(array, f) {
        var result = [];
        for (var i = 0; i < array.length; i++) {
            result.push(f(array[i], i, array, result));
        }
        return result;
    }
    function mapObject(object, f) {
        var result = {};
        objectApply(object, function (value, key) {
            result[key] = f(value);
        });
        return result;
    }
    function filter(array, test) {
        test = test || function (value) { return !!value; };
        var result = [];
        for (var i = 0; i < array.length; i++) {
            if (test(array[i], i, array, result)) {
                result.push(array[i]);
            }
        }
        return result;
    }
    function filterObject(object, test) {
        var result = {};
        objectApply(object, function (value, key) {
            if ((test && test(value, key, object, result)) || Boolean(value)) {
                result[key] = value;
            }
        });
        return result;
    }
    function flatten(object) {
        var result = [];
        objectApply(object, function (value, key) {
            result.push([key, value]);
        });
        return result;
    }
    function any(array, test) {
        for (var i = 0; i < array.length; i++) {
            if (test(array[i], i, array)) {
                return true;
            }
        }
        return false;
    }
    function collections_all(array, test) {
        for (var i = 0; i < array.length; i++) {
            if (!test(array[i], i, array)) {
                return false;
            }
        }
        return true;
    }
    function encodeParamsObject(data) {
        return mapObject(data, function (value) {
            if (typeof value === "object") {
                value = safeJSONStringify(value);
            }
            return encodeURIComponent(encode(value.toString()));
        });
    }
    function buildQueryString(data) {
        var params = filterObject(data, function (value) {
            return value !== undefined;
        });
        var query = map(flatten(encodeParamsObject(params)), util.method("join", "=")).join("&");
        return query;
    }
    function decycleObject(object) {
        var objects = [], paths = [];
        return (function derez(value, path) {
            var i, name, nu;
            switch (typeof value) {
                case 'object':
                    if (!value) {
                        return null;
                    }
                    for (i = 0; i < objects.length; i += 1) {
                        if (objects[i] === value) {
                            return { $ref: paths[i] };
                        }
                    }
                    objects.push(value);
                    paths.push(path);
                    if (Object.prototype.toString.apply(value) === '[object Array]') {
                        nu = [];
                        for (i = 0; i < value.length; i += 1) {
                            nu[i] = derez(value[i], path + '[' + i + ']');
                        }
                    }
                    else {
                        nu = {};
                        for (name in value) {
                            if (Object.prototype.hasOwnProperty.call(value, name)) {
                                nu[name] = derez(value[name], path + '[' + JSON.stringify(name) + ']');
                            }
                        }
                    }
                    return nu;
                case 'number':
                case 'string':
                case 'boolean':
                    return value;
            }
        }(object, '$'));
    }
    function safeJSONStringify(source) {
        try {
            return JSON.stringify(source);
        }
        catch (e) {
            return JSON.stringify(decycleObject(source));
        }
    }

    // CONCATENATED MODULE: ./src/core/logger.ts


    var Logger = {
        debug: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            if (!core_pusher.log) {
                return;
            }
            core_pusher.log(stringify.apply(this, arguments));
        },
        warn: function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            var message = stringify.apply(this, arguments);
            if (core_pusher.log) {
                core_pusher.log(message);
            }
            else if (window.console) {
                if (window.console.warn) {
                    window.console.warn(message);
                }
                else if (window.console.log) {
                    window.console.log(message);
                }
            }
        }
    };
    /* harmony default export */ var logger = (Logger);

    // CONCATENATED MODULE: ./src/core/utils/url_store.ts
    var urlStore = {
        baseUrl: "https://pusher.com",
        urls: {
            authenticationEndpoint: {
                path: "/docs/authenticating_users",
            },
            javascriptQuickStart: {
                path: "/docs/javascript_quick_start"
            },
            triggeringClientEvents: {
                path: "/docs/client_api_guide/client_events#trigger-events"
            }
        }
    };
    var buildLogSuffix = function (key) {
        var urlPrefix = "See:";
        var urlObj = urlStore.urls[key];
        if (!urlObj)
            return "";
        var url;
        if (urlObj.fullUrl) {
            url = urlObj.fullUrl;
        }
        else if (urlObj.path) {
            url = urlStore.baseUrl + urlObj.path;
        }
        if (!url)
            return "";
        return urlPrefix + " " + url;
    };
    /* harmony default export */ var url_store = ({ buildLogSuffix: buildLogSuffix });

    // CONCATENATED MODULE: ./src/runtimes/isomorphic/auth/xhr_auth.ts



    var ajax = function (context, socketId, callback) {
        var self = this, xhr;
        xhr = runtime.createXHR();
        xhr.open("POST", self.options.authEndpoint, true);
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        for (var headerName in this.authOptions.headers) {
            xhr.setRequestHeader(headerName, this.authOptions.headers[headerName]);
        }
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    var data, parsed = false;
                    try {
                        data = JSON.parse(xhr.responseText);
                        parsed = true;
                    }
                    catch (e) {
                        callback(true, 'JSON returned from webapp was invalid, yet status code was 200. Data was: ' + xhr.responseText);
                    }
                    if (parsed) {
                        callback(false, data);
                    }
                }
                else {
                    var suffix = url_store.buildLogSuffix("authenticationEndpoint");
                    logger.warn('Unable to retrieve auth string from auth endpoint - ' +
                        ("received status " + xhr.status + " from " + self.options.authEndpoint + ". ") +
                        ("Clients must be authenticated to join private or presence channels. " + suffix));
                    callback(true, xhr.status);
                }
            }
        };
        xhr.send(this.composeQuery(socketId));
        return xhr;
    };
    /* harmony default export */ var xhr_auth = (ajax);

    // CONCATENATED MODULE: ./src/runtimes/web/auth/jsonp_auth.ts

    var jsonp = function (context, socketId, callback) {
        if (this.authOptions.headers !== undefined) {
            logger.warn("Warn", "To send headers with the auth request, you must use AJAX, rather than JSONP.");
        }
        var callbackName = context.nextAuthCallbackID.toString();
        context.nextAuthCallbackID++;
        var document = context.getDocument();
        var script = document.createElement("script");
        context.auth_callbacks[callbackName] = function (data) {
            callback(false, data);
        };
        var callback_name = "Pusher.auth_callbacks['" + callbackName + "']";
        script.src = this.options.authEndpoint +
            '?callback=' +
            encodeURIComponent(callback_name) +
            '&' +
            this.composeQuery(socketId);
        var head = document.getElementsByTagName("head")[0] || document.documentElement;
        head.insertBefore(script, head.firstChild);
    };
    /* harmony default export */ var jsonp_auth = (jsonp);

    // CONCATENATED MODULE: ./src/runtimes/web/dom/script_request.ts
    var ScriptRequest = (function () {
        function ScriptRequest(src) {
            this.src = src;
        }
        ScriptRequest.prototype.send = function (receiver) {
            var self = this;
            var errorString = "Error loading " + self.src;
            self.script = document.createElement("script");
            self.script.id = receiver.id;
            self.script.src = self.src;
            self.script.type = "text/javascript";
            self.script.charset = "UTF-8";
            if (self.script.addEventListener) {
                self.script.onerror = function () {
                    receiver.callback(errorString);
                };
                self.script.onload = function () {
                    receiver.callback(null);
                };
            }
            else {
                self.script.onreadystatechange = function () {
                    if (self.script.readyState === 'loaded' ||
                        self.script.readyState === 'complete') {
                        receiver.callback(null);
                    }
                };
            }
            if (self.script.async === undefined && document.attachEvent &&
                /opera/i.test(navigator.userAgent)) {
                self.errorScript = document.createElement("script");
                self.errorScript.id = receiver.id + "_error";
                self.errorScript.text = receiver.name + "('" + errorString + "');";
                self.script.async = self.errorScript.async = false;
            }
            else {
                self.script.async = true;
            }
            var head = document.getElementsByTagName('head')[0];
            head.insertBefore(self.script, head.firstChild);
            if (self.errorScript) {
                head.insertBefore(self.errorScript, self.script.nextSibling);
            }
        };
        ScriptRequest.prototype.cleanup = function () {
            if (this.script) {
                this.script.onload = this.script.onerror = null;
                this.script.onreadystatechange = null;
            }
            if (this.script && this.script.parentNode) {
                this.script.parentNode.removeChild(this.script);
            }
            if (this.errorScript && this.errorScript.parentNode) {
                this.errorScript.parentNode.removeChild(this.errorScript);
            }
            this.script = null;
            this.errorScript = null;
        };
        return ScriptRequest;
    }());
    /* harmony default export */ var script_request = (ScriptRequest);

    // CONCATENATED MODULE: ./src/runtimes/web/dom/jsonp_request.ts


    var jsonp_request_JSONPRequest = (function () {
        function JSONPRequest(url, data) {
            this.url = url;
            this.data = data;
        }
        JSONPRequest.prototype.send = function (receiver) {
            if (this.request) {
                return;
            }
            var query = buildQueryString(this.data);
            var url = this.url + "/" + receiver.number + "?" + query;
            this.request = runtime.createScriptRequest(url);
            this.request.send(receiver);
        };
        JSONPRequest.prototype.cleanup = function () {
            if (this.request) {
                this.request.cleanup();
            }
        };
        return JSONPRequest;
    }());
    /* harmony default export */ var jsonp_request = (jsonp_request_JSONPRequest);

    // CONCATENATED MODULE: ./src/runtimes/web/timeline/jsonp_timeline.ts


    var getAgent = function (sender, useTLS) {
        return function (data, callback) {
            var scheme = "http" + (useTLS ? "s" : "") + "://";
            var url = scheme + (sender.host || sender.options.host) + sender.options.path;
            var request = runtime.createJSONPRequest(url, data);
            var receiver = runtime.ScriptReceivers.create(function (error, result) {
                ScriptReceivers.remove(receiver);
                request.cleanup();
                if (result && result.host) {
                    sender.host = result.host;
                }
                if (callback) {
                    callback(error, result);
                }
            });
            request.send(receiver);
        };
    };
    var jsonp_timeline_jsonp = {
        name: 'jsonp',
        getAgent: getAgent
    };
    /* harmony default export */ var jsonp_timeline = (jsonp_timeline_jsonp);

    // CONCATENATED MODULE: ./src/core/transports/url_schemes.ts

    function getGenericURL(baseScheme, params, path) {
        var scheme = baseScheme + (params.useTLS ? "s" : "");
        var host = params.useTLS ? params.hostTLS : params.hostNonTLS;
        return scheme + "://" + host + path;
    }
    function getGenericPath(key, queryString) {
        var path = "/app/" + key;
        var query = "?protocol=" + defaults.PROTOCOL +
            "&client=js" +
            "&version=" + defaults.VERSION +
            (queryString ? ("&" + queryString) : "");
        return path + query;
    }
    var ws = {
        getInitial: function (key, params) {
            var path = (params.httpPath || "") + getGenericPath(key, "flash=false");
            return getGenericURL("ws", params, path);
        }
    };
    var http = {
        getInitial: function (key, params) {
            var path = (params.httpPath || "/pusher") + getGenericPath(key);
            return getGenericURL("http", params, path);
        }
    };
    var sockjs = {
        getInitial: function (key, params) {
            return getGenericURL("http", params, params.httpPath || "/pusher");
        },
        getPath: function (key, params) {
            return getGenericPath(key);
        }
    };

    // CONCATENATED MODULE: ./src/core/events/callback_registry.ts

    var callback_registry_CallbackRegistry = (function () {
        function CallbackRegistry() {
            this._callbacks = {};
        }
        CallbackRegistry.prototype.get = function (name) {
            return this._callbacks[prefix(name)];
        };
        CallbackRegistry.prototype.add = function (name, callback, context) {
            var prefixedEventName = prefix(name);
            this._callbacks[prefixedEventName] = this._callbacks[prefixedEventName] || [];
            this._callbacks[prefixedEventName].push({
                fn: callback,
                context: context
            });
        };
        CallbackRegistry.prototype.remove = function (name, callback, context) {
            if (!name && !callback && !context) {
                this._callbacks = {};
                return;
            }
            var names = name ? [prefix(name)] : keys(this._callbacks);
            if (callback || context) {
                this.removeCallback(names, callback, context);
            }
            else {
                this.removeAllCallbacks(names);
            }
        };
        CallbackRegistry.prototype.removeCallback = function (names, callback, context) {
            apply(names, function (name) {
                this._callbacks[name] = filter(this._callbacks[name] || [], function (binding) {
                    return (callback && callback !== binding.fn) ||
                        (context && context !== binding.context);
                });
                if (this._callbacks[name].length === 0) {
                    delete this._callbacks[name];
                }
            }, this);
        };
        CallbackRegistry.prototype.removeAllCallbacks = function (names) {
            apply(names, function (name) {
                delete this._callbacks[name];
            }, this);
        };
        return CallbackRegistry;
    }());
    /* harmony default export */ var callback_registry = (callback_registry_CallbackRegistry);
    function prefix(name) {
        return "_" + name;
    }

    // CONCATENATED MODULE: ./src/core/events/dispatcher.ts


    var dispatcher_Dispatcher = (function () {
        function Dispatcher(failThrough) {
            this.callbacks = new callback_registry();
            this.global_callbacks = [];
            this.failThrough = failThrough;
        }
        Dispatcher.prototype.bind = function (eventName, callback, context) {
            this.callbacks.add(eventName, callback, context);
            return this;
        };
        Dispatcher.prototype.bind_global = function (callback) {
            this.global_callbacks.push(callback);
            return this;
        };
        Dispatcher.prototype.unbind = function (eventName, callback, context) {
            this.callbacks.remove(eventName, callback, context);
            return this;
        };
        Dispatcher.prototype.unbind_global = function (callback) {
            if (!callback) {
                this.global_callbacks = [];
                return this;
            }
            this.global_callbacks = filter(this.global_callbacks || [], function (c) { return c !== callback; });
            return this;
        };
        Dispatcher.prototype.unbind_all = function () {
            this.unbind();
            this.unbind_global();
            return this;
        };
        Dispatcher.prototype.emit = function (eventName, data, metadata) {
            for (var i = 0; i < this.global_callbacks.length; i++) {
                this.global_callbacks[i](eventName, data);
            }
            var callbacks = this.callbacks.get(eventName);
            var args = [];
            if (metadata) {
                args.push(data, metadata);
            }
            else if (data) {
                args.push(data);
            }
            if (callbacks && callbacks.length > 0) {
                for (var i = 0; i < callbacks.length; i++) {
                    callbacks[i].fn.apply(callbacks[i].context || window, args);
                }
            }
            else if (this.failThrough) {
                this.failThrough(eventName, data);
            }
            return this;
        };
        return Dispatcher;
    }());
    /* harmony default export */ var dispatcher = (dispatcher_Dispatcher);

    // CONCATENATED MODULE: ./src/core/transports/transport_connection.ts
    var transport_connection_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();





    var transport_connection_TransportConnection = (function (_super) {
        transport_connection_extends(TransportConnection, _super);
        function TransportConnection(hooks, name, priority, key, options) {
            var _this = _super.call(this) || this;
            _this.initialize = runtime.transportConnectionInitializer;
            _this.hooks = hooks;
            _this.name = name;
            _this.priority = priority;
            _this.key = key;
            _this.options = options;
            _this.state = "new";
            _this.timeline = options.timeline;
            _this.activityTimeout = options.activityTimeout;
            _this.id = _this.timeline.generateUniqueID();
            return _this;
        }
        TransportConnection.prototype.handlesActivityChecks = function () {
            return Boolean(this.hooks.handlesActivityChecks);
        };
        TransportConnection.prototype.supportsPing = function () {
            return Boolean(this.hooks.supportsPing);
        };
        TransportConnection.prototype.connect = function () {
            var _this = this;
            if (this.socket || this.state !== "initialized") {
                return false;
            }
            var url = this.hooks.urls.getInitial(this.key, this.options);
            try {
                this.socket = this.hooks.getSocket(url, this.options);
            }
            catch (e) {
                util.defer(function () {
                    _this.onError(e);
                    _this.changeState("closed");
                });
                return false;
            }
            this.bindListeners();
            logger.debug("Connecting", { transport: this.name, url: url });
            this.changeState("connecting");
            return true;
        };
        TransportConnection.prototype.close = function () {
            if (this.socket) {
                this.socket.close();
                return true;
            }
            else {
                return false;
            }
        };
        TransportConnection.prototype.send = function (data) {
            var _this = this;
            if (this.state === "open") {
                util.defer(function () {
                    if (_this.socket) {
                        _this.socket.send(data);
                    }
                });
                return true;
            }
            else {
                return false;
            }
        };
        TransportConnection.prototype.ping = function () {
            if (this.state === "open" && this.supportsPing()) {
                this.socket.ping();
            }
        };
        TransportConnection.prototype.onOpen = function () {
            if (this.hooks.beforeOpen) {
                this.hooks.beforeOpen(this.socket, this.hooks.urls.getPath(this.key, this.options));
            }
            this.changeState("open");
            this.socket.onopen = undefined;
        };
        TransportConnection.prototype.onError = function (error) {
            this.emit("error", { type: 'WebSocketError', error: error });
            this.timeline.error(this.buildTimelineMessage({ error: error.toString() }));
        };
        TransportConnection.prototype.onClose = function (closeEvent) {
            if (closeEvent) {
                this.changeState("closed", {
                    code: closeEvent.code,
                    reason: closeEvent.reason,
                    wasClean: closeEvent.wasClean
                });
            }
            else {
                this.changeState("closed");
            }
            this.unbindListeners();
            this.socket = undefined;
        };
        TransportConnection.prototype.onMessage = function (message) {
            this.emit("message", message);
        };
        TransportConnection.prototype.onActivity = function () {
            this.emit("activity");
        };
        TransportConnection.prototype.bindListeners = function () {
            var _this = this;
            this.socket.onopen = function () {
                _this.onOpen();
            };
            this.socket.onerror = function (error) {
                _this.onError(error);
            };
            this.socket.onclose = function (closeEvent) {
                _this.onClose(closeEvent);
            };
            this.socket.onmessage = function (message) {
                _this.onMessage(message);
            };
            if (this.supportsPing()) {
                this.socket.onactivity = function () { _this.onActivity(); };
            }
        };
        TransportConnection.prototype.unbindListeners = function () {
            if (this.socket) {
                this.socket.onopen = undefined;
                this.socket.onerror = undefined;
                this.socket.onclose = undefined;
                this.socket.onmessage = undefined;
                if (this.supportsPing()) {
                    this.socket.onactivity = undefined;
                }
            }
        };
        TransportConnection.prototype.changeState = function (state, params) {
            this.state = state;
            this.timeline.info(this.buildTimelineMessage({
                state: state,
                params: params
            }));
            this.emit(state, params);
        };
        TransportConnection.prototype.buildTimelineMessage = function (message) {
            return extend({ cid: this.id }, message);
        };
        return TransportConnection;
    }(dispatcher));
    /* harmony default export */ var transport_connection = (transport_connection_TransportConnection);

    // CONCATENATED MODULE: ./src/core/transports/transport.ts

    var transport_Transport = (function () {
        function Transport(hooks) {
            this.hooks = hooks;
        }
        Transport.prototype.isSupported = function (environment) {
            return this.hooks.isSupported(environment);
        };
        Transport.prototype.createConnection = function (name, priority, key, options) {
            return new transport_connection(this.hooks, name, priority, key, options);
        };
        return Transport;
    }());
    /* harmony default export */ var transports_transport = (transport_Transport);

    // CONCATENATED MODULE: ./src/runtimes/isomorphic/transports/transports.ts




    var WSTransport = new transports_transport({
        urls: ws,
        handlesActivityChecks: false,
        supportsPing: false,
        isInitialized: function () {
            return Boolean(runtime.getWebSocketAPI());
        },
        isSupported: function () {
            return Boolean(runtime.getWebSocketAPI());
        },
        getSocket: function (url) {
            return runtime.createWebSocket(url);
        }
    });
    var httpConfiguration = {
        urls: http,
        handlesActivityChecks: false,
        supportsPing: true,
        isInitialized: function () {
            return true;
        }
    };
    var streamingConfiguration = extend({ getSocket: function (url) {
            return runtime.HTTPFactory.createStreamingSocket(url);
        }
    }, httpConfiguration);
    var pollingConfiguration = extend({ getSocket: function (url) {
            return runtime.HTTPFactory.createPollingSocket(url);
        }
    }, httpConfiguration);
    var xhrConfiguration = {
        isSupported: function () {
            return runtime.isXHRSupported();
        }
    };
    var XHRStreamingTransport = new transports_transport(extend({}, streamingConfiguration, xhrConfiguration));
    var XHRPollingTransport = new transports_transport(extend({}, pollingConfiguration, xhrConfiguration));
    var Transports = {
        ws: WSTransport,
        xhr_streaming: XHRStreamingTransport,
        xhr_polling: XHRPollingTransport
    };
    /* harmony default export */ var transports = (Transports);

    // CONCATENATED MODULE: ./src/runtimes/web/transports/transports.ts






    var SockJSTransport = new transports_transport({
        file: "sockjs",
        urls: sockjs,
        handlesActivityChecks: true,
        supportsPing: false,
        isSupported: function () {
            return true;
        },
        isInitialized: function () {
            return window.SockJS !== undefined;
        },
        getSocket: function (url, options) {
            return new window.SockJS(url, null, {
                js_path: Dependencies.getPath("sockjs", {
                    useTLS: options.useTLS
                }),
                ignore_null_origin: options.ignoreNullOrigin
            });
        },
        beforeOpen: function (socket, path) {
            socket.send(JSON.stringify({
                path: path
            }));
        }
    });
    var xdrConfiguration = {
        isSupported: function (environment) {
            var yes = runtime.isXDRSupported(environment.useTLS);
            return yes;
        }
    };
    var XDRStreamingTransport = new transports_transport(extend({}, streamingConfiguration, xdrConfiguration));
    var XDRPollingTransport = new transports_transport(extend({}, pollingConfiguration, xdrConfiguration));
    transports.xdr_streaming = XDRStreamingTransport;
    transports.xdr_polling = XDRPollingTransport;
    transports.sockjs = SockJSTransport;
    /* harmony default export */ var transports_transports = (transports);

    // CONCATENATED MODULE: ./src/runtimes/web/net_info.ts
    var net_info_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();

    var NetInfo = (function (_super) {
        net_info_extends(NetInfo, _super);
        function NetInfo() {
            var _this = _super.call(this) || this;
            var self = _this;
            if (window.addEventListener !== undefined) {
                window.addEventListener("online", function () {
                    self.emit('online');
                }, false);
                window.addEventListener("offline", function () {
                    self.emit('offline');
                }, false);
            }
            return _this;
        }
        NetInfo.prototype.isOnline = function () {
            if (window.navigator.onLine === undefined) {
                return true;
            }
            else {
                return window.navigator.onLine;
            }
        };
        return NetInfo;
    }(dispatcher));

    var net_info_Network = new NetInfo();

    // CONCATENATED MODULE: ./src/core/transports/assistant_to_the_transport_manager.ts


    var assistant_to_the_transport_manager_AssistantToTheTransportManager = (function () {
        function AssistantToTheTransportManager(manager, transport, options) {
            this.manager = manager;
            this.transport = transport;
            this.minPingDelay = options.minPingDelay;
            this.maxPingDelay = options.maxPingDelay;
            this.pingDelay = undefined;
        }
        AssistantToTheTransportManager.prototype.createConnection = function (name, priority, key, options) {
            var _this = this;
            options = extend({}, options, {
                activityTimeout: this.pingDelay
            });
            var connection = this.transport.createConnection(name, priority, key, options);
            var openTimestamp = null;
            var onOpen = function () {
                connection.unbind("open", onOpen);
                connection.bind("closed", onClosed);
                openTimestamp = util.now();
            };
            var onClosed = function (closeEvent) {
                connection.unbind("closed", onClosed);
                if (closeEvent.code === 1002 || closeEvent.code === 1003) {
                    _this.manager.reportDeath();
                }
                else if (!closeEvent.wasClean && openTimestamp) {
                    var lifespan = util.now() - openTimestamp;
                    if (lifespan < 2 * _this.maxPingDelay) {
                        _this.manager.reportDeath();
                        _this.pingDelay = Math.max(lifespan / 2, _this.minPingDelay);
                    }
                }
            };
            connection.bind("open", onOpen);
            return connection;
        };
        AssistantToTheTransportManager.prototype.isSupported = function (environment) {
            return this.manager.isAlive() && this.transport.isSupported(environment);
        };
        return AssistantToTheTransportManager;
    }());
    /* harmony default export */ var assistant_to_the_transport_manager = (assistant_to_the_transport_manager_AssistantToTheTransportManager);

    // CONCATENATED MODULE: ./src/core/connection/protocol/protocol.ts
    var Protocol = {
        decodeMessage: function (messageEvent) {
            try {
                var messageData = JSON.parse(messageEvent.data);
                var pusherEventData = messageData.data;
                if (typeof pusherEventData === 'string') {
                    try {
                        pusherEventData = JSON.parse(messageData.data);
                    }
                    catch (e) { }
                }
                var pusherEvent = {
                    event: messageData.event,
                    channel: messageData.channel,
                    data: pusherEventData,
                };
                if (messageData.user_id) {
                    pusherEvent.user_id = messageData.user_id;
                }
                return pusherEvent;
            }
            catch (e) {
                throw { type: 'MessageParseError', error: e, data: messageEvent.data };
            }
        },
        encodeMessage: function (event) {
            return JSON.stringify(event);
        },
        processHandshake: function (messageEvent) {
            var message = Protocol.decodeMessage(messageEvent);
            if (message.event === "pusher:connection_established") {
                if (!message.data.activity_timeout) {
                    throw "No activity timeout specified in handshake";
                }
                return {
                    action: "connected",
                    id: message.data.socket_id,
                    activityTimeout: message.data.activity_timeout * 1000
                };
            }
            else if (message.event === "pusher:error") {
                return {
                    action: this.getCloseAction(message.data),
                    error: this.getCloseError(message.data)
                };
            }
            else {
                throw "Invalid handshake";
            }
        },
        getCloseAction: function (closeEvent) {
            if (closeEvent.code < 4000) {
                if (closeEvent.code >= 1002 && closeEvent.code <= 1004) {
                    return "backoff";
                }
                else {
                    return null;
                }
            }
            else if (closeEvent.code === 4000) {
                return "tls_only";
            }
            else if (closeEvent.code < 4100) {
                return "refused";
            }
            else if (closeEvent.code < 4200) {
                return "backoff";
            }
            else if (closeEvent.code < 4300) {
                return "retry";
            }
            else {
                return "refused";
            }
        },
        getCloseError: function (closeEvent) {
            if (closeEvent.code !== 1000 && closeEvent.code !== 1001) {
                return {
                    type: 'PusherError',
                    data: {
                        code: closeEvent.code,
                        message: closeEvent.reason || closeEvent.message
                    }
                };
            }
            else {
                return null;
            }
        }
    };
    /* harmony default export */ var protocol_protocol = (Protocol);

    // CONCATENATED MODULE: ./src/core/connection/connection.ts
    var connection_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();




    var connection_Connection = (function (_super) {
        connection_extends(Connection, _super);
        function Connection(id, transport) {
            var _this = _super.call(this) || this;
            _this.id = id;
            _this.transport = transport;
            _this.activityTimeout = transport.activityTimeout;
            _this.bindListeners();
            return _this;
        }
        Connection.prototype.handlesActivityChecks = function () {
            return this.transport.handlesActivityChecks();
        };
        Connection.prototype.send = function (data) {
            return this.transport.send(data);
        };
        Connection.prototype.send_event = function (name, data, channel) {
            var event = { event: name, data: data };
            if (channel) {
                event.channel = channel;
            }
            logger.debug('Event sent', event);
            return this.send(protocol_protocol.encodeMessage(event));
        };
        Connection.prototype.ping = function () {
            if (this.transport.supportsPing()) {
                this.transport.ping();
            }
            else {
                this.send_event('pusher:ping', {});
            }
        };
        Connection.prototype.close = function () {
            this.transport.close();
        };
        Connection.prototype.bindListeners = function () {
            var _this = this;
            var listeners = {
                message: function (messageEvent) {
                    var pusherEvent;
                    try {
                        pusherEvent = protocol_protocol.decodeMessage(messageEvent);
                    }
                    catch (e) {
                        _this.emit('error', {
                            type: 'MessageParseError',
                            error: e,
                            data: messageEvent.data
                        });
                    }
                    if (pusherEvent !== undefined) {
                        logger.debug('Event recd', pusherEvent);
                        switch (pusherEvent.event) {
                            case 'pusher:error':
                                _this.emit('error', { type: 'PusherError', data: pusherEvent.data });
                                break;
                            case 'pusher:ping':
                                _this.emit("ping");
                                break;
                            case 'pusher:pong':
                                _this.emit("pong");
                                break;
                        }
                        _this.emit('message', pusherEvent);
                    }
                },
                activity: function () {
                    _this.emit("activity");
                },
                error: function (error) {
                    _this.emit("error", { type: "WebSocketError", error: error });
                },
                closed: function (closeEvent) {
                    unbindListeners();
                    if (closeEvent && closeEvent.code) {
                        _this.handleCloseEvent(closeEvent);
                    }
                    _this.transport = null;
                    _this.emit("closed");
                }
            };
            var unbindListeners = function () {
                objectApply(listeners, function (listener, event) {
                    _this.transport.unbind(event, listener);
                });
            };
            objectApply(listeners, function (listener, event) {
                _this.transport.bind(event, listener);
            });
        };
        Connection.prototype.handleCloseEvent = function (closeEvent) {
            var action = protocol_protocol.getCloseAction(closeEvent);
            var error = protocol_protocol.getCloseError(closeEvent);
            if (error) {
                this.emit('error', error);
            }
            if (action) {
                this.emit(action, { action: action, error: error });
            }
        };
        return Connection;
    }(dispatcher));
    /* harmony default export */ var connection_connection = (connection_Connection);

    // CONCATENATED MODULE: ./src/core/connection/handshake/index.ts



    var handshake_Handshake = (function () {
        function Handshake(transport, callback) {
            this.transport = transport;
            this.callback = callback;
            this.bindListeners();
        }
        Handshake.prototype.close = function () {
            this.unbindListeners();
            this.transport.close();
        };
        Handshake.prototype.bindListeners = function () {
            var _this = this;
            this.onMessage = function (m) {
                _this.unbindListeners();
                var result;
                try {
                    result = protocol_protocol.processHandshake(m);
                }
                catch (e) {
                    _this.finish("error", { error: e });
                    _this.transport.close();
                    return;
                }
                if (result.action === "connected") {
                    _this.finish("connected", {
                        connection: new connection_connection(result.id, _this.transport),
                        activityTimeout: result.activityTimeout
                    });
                }
                else {
                    _this.finish(result.action, { error: result.error });
                    _this.transport.close();
                }
            };
            this.onClosed = function (closeEvent) {
                _this.unbindListeners();
                var action = protocol_protocol.getCloseAction(closeEvent) || "backoff";
                var error = protocol_protocol.getCloseError(closeEvent);
                _this.finish(action, { error: error });
            };
            this.transport.bind("message", this.onMessage);
            this.transport.bind("closed", this.onClosed);
        };
        Handshake.prototype.unbindListeners = function () {
            this.transport.unbind("message", this.onMessage);
            this.transport.unbind("closed", this.onClosed);
        };
        Handshake.prototype.finish = function (action, params) {
            this.callback(extend({ transport: this.transport, action: action }, params));
        };
        return Handshake;
    }());
    /* harmony default export */ var connection_handshake = (handshake_Handshake);

    // CONCATENATED MODULE: ./src/core/auth/pusher_authorizer.ts

    var pusher_authorizer_PusherAuthorizer = (function () {
        function PusherAuthorizer(channel, options) {
            this.channel = channel;
            var authTransport = options.authTransport;
            if (typeof runtime.getAuthorizers()[authTransport] === "undefined") {
                throw "'" + authTransport + "' is not a recognized auth transport";
            }
            this.type = authTransport;
            this.options = options;
            this.authOptions = (options || {}).auth || {};
        }
        PusherAuthorizer.prototype.composeQuery = function (socketId) {
            var query = 'socket_id=' + encodeURIComponent(socketId) +
                '&channel_name=' + encodeURIComponent(this.channel.name);
            for (var i in this.authOptions.params) {
                query += "&" + encodeURIComponent(i) + "=" + encodeURIComponent(this.authOptions.params[i]);
            }
            return query;
        };
        PusherAuthorizer.prototype.authorize = function (socketId, callback) {
            PusherAuthorizer.authorizers = PusherAuthorizer.authorizers || runtime.getAuthorizers();
            return PusherAuthorizer.authorizers[this.type].call(this, runtime, socketId, callback);
        };
        return PusherAuthorizer;
    }());
    /* harmony default export */ var pusher_authorizer = (pusher_authorizer_PusherAuthorizer);

    // CONCATENATED MODULE: ./src/core/timeline/timeline_sender.ts

    var timeline_sender_TimelineSender = (function () {
        function TimelineSender(timeline, options) {
            this.timeline = timeline;
            this.options = options || {};
        }
        TimelineSender.prototype.send = function (useTLS, callback) {
            if (this.timeline.isEmpty()) {
                return;
            }
            this.timeline.send(runtime.TimelineTransport.getAgent(this, useTLS), callback);
        };
        return TimelineSender;
    }());
    /* harmony default export */ var timeline_sender = (timeline_sender_TimelineSender);

    // CONCATENATED MODULE: ./src/core/errors.ts
    var errors_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();
    var BadEventName = (function (_super) {
        errors_extends(BadEventName, _super);
        function BadEventName(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return BadEventName;
    }(Error));

    var RequestTimedOut = (function (_super) {
        errors_extends(RequestTimedOut, _super);
        function RequestTimedOut(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return RequestTimedOut;
    }(Error));

    var TransportPriorityTooLow = (function (_super) {
        errors_extends(TransportPriorityTooLow, _super);
        function TransportPriorityTooLow(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return TransportPriorityTooLow;
    }(Error));

    var TransportClosed = (function (_super) {
        errors_extends(TransportClosed, _super);
        function TransportClosed(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return TransportClosed;
    }(Error));

    var UnsupportedFeature = (function (_super) {
        errors_extends(UnsupportedFeature, _super);
        function UnsupportedFeature(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return UnsupportedFeature;
    }(Error));

    var UnsupportedTransport = (function (_super) {
        errors_extends(UnsupportedTransport, _super);
        function UnsupportedTransport(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return UnsupportedTransport;
    }(Error));

    var UnsupportedStrategy = (function (_super) {
        errors_extends(UnsupportedStrategy, _super);
        function UnsupportedStrategy(msg) {
            var _newTarget = this.constructor;
            var _this = _super.call(this, msg) || this;
            Object.setPrototypeOf(_this, _newTarget.prototype);
            return _this;
        }
        return UnsupportedStrategy;
    }(Error));


    // CONCATENATED MODULE: ./src/core/channels/channel.ts
    var channel_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();




    var channel_Channel = (function (_super) {
        channel_extends(Channel, _super);
        function Channel(name, pusher) {
            var _this = _super.call(this, function (event, data) {
                logger.debug('No callbacks on ' + name + ' for ' + event);
            }) || this;
            _this.name = name;
            _this.pusher = pusher;
            _this.subscribed = false;
            _this.subscriptionPending = false;
            _this.subscriptionCancelled = false;
            return _this;
        }
        Channel.prototype.authorize = function (socketId, callback) {
            return callback(false, {});
        };
        Channel.prototype.trigger = function (event, data) {
            if (event.indexOf("client-") !== 0) {
                throw new BadEventName("Event '" + event + "' does not start with 'client-'");
            }
            if (!this.subscribed) {
                var suffix = url_store.buildLogSuffix("triggeringClientEvents");
                logger.warn("Client event triggered before channel 'subscription_succeeded' event . " + suffix);
            }
            return this.pusher.send_event(event, data, this.name);
        };
        Channel.prototype.disconnect = function () {
            this.subscribed = false;
            this.subscriptionPending = false;
        };
        Channel.prototype.handleEvent = function (event) {
            var eventName = event.event;
            var data = event.data;
            if (eventName === "pusher_internal:subscription_succeeded") {
                this.handleSubscriptionSucceededEvent(event);
            }
            else if (eventName.indexOf("pusher_internal:") !== 0) {
                var metadata = {};
                this.emit(eventName, data, metadata);
            }
        };
        Channel.prototype.handleSubscriptionSucceededEvent = function (event) {
            this.subscriptionPending = false;
            this.subscribed = true;
            if (this.subscriptionCancelled) {
                this.pusher.unsubscribe(this.name);
            }
            else {
                this.emit("pusher:subscription_succeeded", event.data);
            }
        };
        Channel.prototype.subscribe = function () {
            var _this = this;
            if (this.subscribed) {
                return;
            }
            this.subscriptionPending = true;
            this.subscriptionCancelled = false;
            this.authorize(this.pusher.connection.socket_id, function (error, data) {
                if (error) {
                    _this.emit('pusher:subscription_error', data);
                }
                else {
                    _this.pusher.send_event('pusher:subscribe', {
                        auth: data.auth,
                        channel_data: data.channel_data,
                        channel: _this.name
                    });
                }
            });
        };
        Channel.prototype.unsubscribe = function () {
            this.subscribed = false;
            this.pusher.send_event('pusher:unsubscribe', {
                channel: this.name
            });
        };
        Channel.prototype.cancelSubscription = function () {
            this.subscriptionCancelled = true;
        };
        Channel.prototype.reinstateSubscription = function () {
            this.subscriptionCancelled = false;
        };
        return Channel;
    }(dispatcher));
    /* harmony default export */ var channels_channel = (channel_Channel);

    // CONCATENATED MODULE: ./src/core/channels/private_channel.ts
    var private_channel_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();


    var private_channel_PrivateChannel = (function (_super) {
        private_channel_extends(PrivateChannel, _super);
        function PrivateChannel() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        PrivateChannel.prototype.authorize = function (socketId, callback) {
            var authorizer = factory.createAuthorizer(this, this.pusher.config);
            return authorizer.authorize(socketId, callback);
        };
        return PrivateChannel;
    }(channels_channel));
    /* harmony default export */ var private_channel = (private_channel_PrivateChannel);

    // CONCATENATED MODULE: ./src/core/channels/members.ts

    var members_Members = (function () {
        function Members() {
            this.reset();
        }
        Members.prototype.get = function (id) {
            if (Object.prototype.hasOwnProperty.call(this.members, id)) {
                return {
                    id: id,
                    info: this.members[id]
                };
            }
            else {
                return null;
            }
        };
        Members.prototype.each = function (callback) {
            var _this = this;
            objectApply(this.members, function (member, id) {
                callback(_this.get(id));
            });
        };
        Members.prototype.setMyID = function (id) {
            this.myID = id;
        };
        Members.prototype.onSubscription = function (subscriptionData) {
            this.members = subscriptionData.presence.hash;
            this.count = subscriptionData.presence.count;
            this.me = this.get(this.myID);
        };
        Members.prototype.addMember = function (memberData) {
            if (this.get(memberData.user_id) === null) {
                this.count++;
            }
            this.members[memberData.user_id] = memberData.user_info;
            return this.get(memberData.user_id);
        };
        Members.prototype.removeMember = function (memberData) {
            var member = this.get(memberData.user_id);
            if (member) {
                delete this.members[memberData.user_id];
                this.count--;
            }
            return member;
        };
        Members.prototype.reset = function () {
            this.members = {};
            this.count = 0;
            this.myID = null;
            this.me = null;
        };
        return Members;
    }());
    /* harmony default export */ var members = (members_Members);

    // CONCATENATED MODULE: ./src/core/channels/presence_channel.ts
    var presence_channel_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();




    var presence_channel_PresenceChannel = (function (_super) {
        presence_channel_extends(PresenceChannel, _super);
        function PresenceChannel(name, pusher) {
            var _this = _super.call(this, name, pusher) || this;
            _this.members = new members();
            return _this;
        }
        PresenceChannel.prototype.authorize = function (socketId, callback) {
            var _this = this;
            _super.prototype.authorize.call(this, socketId, function (error, authData) {
                if (!error) {
                    if (authData.channel_data === undefined) {
                        var suffix = url_store.buildLogSuffix("authenticationEndpoint");
                        logger.warn("Invalid auth response for channel '" + _this.name + "'," +
                            ("expected 'channel_data' field. " + suffix));
                        callback("Invalid auth response");
                        return;
                    }
                    var channelData = JSON.parse(authData.channel_data);
                    _this.members.setMyID(channelData.user_id);
                }
                callback(error, authData);
            });
        };
        PresenceChannel.prototype.handleEvent = function (event) {
            var eventName = event.event;
            if (eventName.indexOf("pusher_internal:") === 0) {
                this.handleInternalEvent(event);
            }
            else {
                var data = event.data;
                var metadata = {};
                if (event.user_id) {
                    metadata.user_id = event.user_id;
                }
                this.emit(eventName, data, metadata);
            }
        };
        PresenceChannel.prototype.handleInternalEvent = function (event) {
            var eventName = event.event;
            var data = event.data;
            switch (eventName) {
                case "pusher_internal:subscription_succeeded":
                    this.handleSubscriptionSucceededEvent(event);
                    break;
                case "pusher_internal:member_added":
                    var addedMember = this.members.addMember(data);
                    this.emit('pusher:member_added', addedMember);
                    break;
                case "pusher_internal:member_removed":
                    var removedMember = this.members.removeMember(data);
                    if (removedMember) {
                        this.emit('pusher:member_removed', removedMember);
                    }
                    break;
            }
        };
        PresenceChannel.prototype.handleSubscriptionSucceededEvent = function (event) {
            this.subscriptionPending = false;
            this.subscribed = true;
            if (this.subscriptionCancelled) {
                this.pusher.unsubscribe(this.name);
            }
            else {
                this.members.onSubscription(event.data);
                this.emit("pusher:subscription_succeeded", this.members);
            }
        };
        PresenceChannel.prototype.disconnect = function () {
            this.members.reset();
            _super.prototype.disconnect.call(this);
        };
        return PresenceChannel;
    }(private_channel));
    /* harmony default export */ var presence_channel = (presence_channel_PresenceChannel);

    // EXTERNAL MODULE: ./node_modules/tweetnacl/nacl-fast.js
    var nacl_fast = __webpack_require__(0);

    // EXTERNAL MODULE: ./node_modules/tweetnacl-util/nacl-util.js
    var nacl_util = __webpack_require__(1);

    // CONCATENATED MODULE: ./src/core/channels/encrypted_channel.ts
    var encrypted_channel_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();





    var encrypted_channel_EncryptedChannel = (function (_super) {
        encrypted_channel_extends(EncryptedChannel, _super);
        function EncryptedChannel() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.key = null;
            return _this;
        }
        EncryptedChannel.prototype.authorize = function (socketId, callback) {
            var _this = this;
            _super.prototype.authorize.call(this, socketId, function (error, authData) {
                if (error) {
                    callback(true, authData);
                    return;
                }
                var sharedSecret = authData["shared_secret"];
                if (!sharedSecret) {
                    var errorMsg = "No shared_secret key in auth payload for encrypted channel: " + _this.name;
                    callback(true, errorMsg);
                    logger.warn("Error: " + errorMsg);
                    return;
                }
                _this.key = Object(nacl_util["decodeBase64"])(sharedSecret);
                delete authData["shared_secret"];
                callback(false, authData);
            });
        };
        EncryptedChannel.prototype.trigger = function (event, data) {
            throw new UnsupportedFeature('Client events are not currently supported for encrypted channels');
        };
        EncryptedChannel.prototype.handleEvent = function (event) {
            var eventName = event.event;
            var data = event.data;
            if (eventName.indexOf("pusher_internal:") === 0 || eventName.indexOf("pusher:") === 0) {
                _super.prototype.handleEvent.call(this, event);
                return;
            }
            this.handleEncryptedEvent(eventName, data);
        };
        EncryptedChannel.prototype.handleEncryptedEvent = function (event, data) {
            var _this = this;
            if (!this.key) {
                logger.debug('Received encrypted event before key has been retrieved from the authEndpoint');
                return;
            }
            if (!data.ciphertext || !data.nonce) {
                logger.warn('Unexpected format for encrypted event, expected object with `ciphertext` and `nonce` fields, got: ' + data);
                return;
            }
            var cipherText = Object(nacl_util["decodeBase64"])(data.ciphertext);
            if (cipherText.length < nacl_fast["secretbox"].overheadLength) {
                logger.warn("Expected encrypted event ciphertext length to be " + nacl_fast["secretbox"].overheadLength + ", got: " + cipherText.length);
                return;
            }
            var nonce = Object(nacl_util["decodeBase64"])(data.nonce);
            if (nonce.length < nacl_fast["secretbox"].nonceLength) {
                logger.warn("Expected encrypted event nonce length to be " + nacl_fast["secretbox"].nonceLength + ", got: " + nonce.length);
                return;
            }
            var bytes = nacl_fast["secretbox"].open(cipherText, nonce, this.key);
            if (bytes === null) {
                logger.debug('Failed to decrypt an event, probably because it was encrypted with a different key. Fetching a new key from the authEndpoint...');
                this.authorize(this.pusher.connection.socket_id, function (error, authData) {
                    if (error) {
                        logger.warn("Failed to make a request to the authEndpoint: " + authData + ". Unable to fetch new key, so dropping encrypted event");
                        return;
                    }
                    bytes = nacl_fast["secretbox"].open(cipherText, nonce, _this.key);
                    if (bytes === null) {
                        logger.warn("Failed to decrypt event with new key. Dropping encrypted event");
                        return;
                    }
                    _this.emitJSON(event, Object(nacl_util["encodeUTF8"])(bytes));
                    return;
                });
                return;
            }
            this.emitJSON(event, Object(nacl_util["encodeUTF8"])(bytes));
        };
        EncryptedChannel.prototype.emitJSON = function (eventName, data) {
            try {
                this.emit(eventName, JSON.parse(data));
            }
            catch (e) {
                this.emit(eventName, data);
            }
            return this;
        };
        return EncryptedChannel;
    }(private_channel));
    /* harmony default export */ var encrypted_channel = (encrypted_channel_EncryptedChannel);

    // CONCATENATED MODULE: ./src/core/connection/connection_manager.ts
    var connection_manager_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();





    var connection_manager_ConnectionManager = (function (_super) {
        connection_manager_extends(ConnectionManager, _super);
        function ConnectionManager(key, options) {
            var _this = _super.call(this) || this;
            _this.key = key;
            _this.options = options || {};
            _this.state = "initialized";
            _this.connection = null;
            _this.usingTLS = !!options.useTLS;
            _this.timeline = _this.options.timeline;
            _this.errorCallbacks = _this.buildErrorCallbacks();
            _this.connectionCallbacks = _this.buildConnectionCallbacks(_this.errorCallbacks);
            _this.handshakeCallbacks = _this.buildHandshakeCallbacks(_this.errorCallbacks);
            var Network = runtime.getNetwork();
            Network.bind("online", function () {
                _this.timeline.info({ netinfo: "online" });
                if (_this.state === "connecting" || _this.state === "unavailable") {
                    _this.retryIn(0);
                }
            });
            Network.bind("offline", function () {
                _this.timeline.info({ netinfo: "offline" });
                if (_this.connection) {
                    _this.sendActivityCheck();
                }
            });
            _this.updateStrategy();
            return _this;
        }
        ConnectionManager.prototype.connect = function () {
            if (this.connection || this.runner) {
                return;
            }
            if (!this.strategy.isSupported()) {
                this.updateState("failed");
                return;
            }
            this.updateState("connecting");
            this.startConnecting();
            this.setUnavailableTimer();
        };
        ConnectionManager.prototype.send = function (data) {
            if (this.connection) {
                return this.connection.send(data);
            }
            else {
                return false;
            }
        };
        ConnectionManager.prototype.send_event = function (name, data, channel) {
            if (this.connection) {
                return this.connection.send_event(name, data, channel);
            }
            else {
                return false;
            }
        };
        ConnectionManager.prototype.disconnect = function () {
            this.disconnectInternally();
            this.updateState("disconnected");
        };
        ConnectionManager.prototype.isUsingTLS = function () {
            return this.usingTLS;
        };
        ConnectionManager.prototype.startConnecting = function () {
            var _this = this;
            var callback = function (error, handshake) {
                if (error) {
                    _this.runner = _this.strategy.connect(0, callback);
                }
                else {
                    if (handshake.action === "error") {
                        _this.emit("error", { type: "HandshakeError", error: handshake.error });
                        _this.timeline.error({ handshakeError: handshake.error });
                    }
                    else {
                        _this.abortConnecting();
                        _this.handshakeCallbacks[handshake.action](handshake);
                    }
                }
            };
            this.runner = this.strategy.connect(0, callback);
        };
        ConnectionManager.prototype.abortConnecting = function () {
            if (this.runner) {
                this.runner.abort();
                this.runner = null;
            }
        };
        ConnectionManager.prototype.disconnectInternally = function () {
            this.abortConnecting();
            this.clearRetryTimer();
            this.clearUnavailableTimer();
            if (this.connection) {
                var connection = this.abandonConnection();
                connection.close();
            }
        };
        ConnectionManager.prototype.updateStrategy = function () {
            this.strategy = this.options.getStrategy({
                key: this.key,
                timeline: this.timeline,
                useTLS: this.usingTLS
            });
        };
        ConnectionManager.prototype.retryIn = function (delay) {
            var _this = this;
            this.timeline.info({ action: "retry", delay: delay });
            if (delay > 0) {
                this.emit("connecting_in", Math.round(delay / 1000));
            }
            this.retryTimer = new OneOffTimer(delay || 0, function () {
                _this.disconnectInternally();
                _this.connect();
            });
        };
        ConnectionManager.prototype.clearRetryTimer = function () {
            if (this.retryTimer) {
                this.retryTimer.ensureAborted();
                this.retryTimer = null;
            }
        };
        ConnectionManager.prototype.setUnavailableTimer = function () {
            var _this = this;
            this.unavailableTimer = new OneOffTimer(this.options.unavailableTimeout, function () {
                _this.updateState("unavailable");
            });
        };
        ConnectionManager.prototype.clearUnavailableTimer = function () {
            if (this.unavailableTimer) {
                this.unavailableTimer.ensureAborted();
            }
        };
        ConnectionManager.prototype.sendActivityCheck = function () {
            var _this = this;
            this.stopActivityCheck();
            this.connection.ping();
            this.activityTimer = new OneOffTimer(this.options.pongTimeout, function () {
                _this.timeline.error({ pong_timed_out: _this.options.pongTimeout });
                _this.retryIn(0);
            });
        };
        ConnectionManager.prototype.resetActivityCheck = function () {
            var _this = this;
            this.stopActivityCheck();
            if (this.connection && !this.connection.handlesActivityChecks()) {
                this.activityTimer = new OneOffTimer(this.activityTimeout, function () {
                    _this.sendActivityCheck();
                });
            }
        };
        ConnectionManager.prototype.stopActivityCheck = function () {
            if (this.activityTimer) {
                this.activityTimer.ensureAborted();
            }
        };
        ConnectionManager.prototype.buildConnectionCallbacks = function (errorCallbacks) {
            var _this = this;
            return extend({}, errorCallbacks, {
                message: function (message) {
                    _this.resetActivityCheck();
                    _this.emit('message', message);
                },
                ping: function () {
                    _this.send_event('pusher:pong', {});
                },
                activity: function () {
                    _this.resetActivityCheck();
                },
                error: function (error) {
                    _this.emit("error", { type: "WebSocketError", error: error });
                },
                closed: function () {
                    _this.abandonConnection();
                    if (_this.shouldRetry()) {
                        _this.retryIn(1000);
                    }
                }
            });
        };
        ConnectionManager.prototype.buildHandshakeCallbacks = function (errorCallbacks) {
            var _this = this;
            return extend({}, errorCallbacks, {
                connected: function (handshake) {
                    _this.activityTimeout = Math.min(_this.options.activityTimeout, handshake.activityTimeout, handshake.connection.activityTimeout || Infinity);
                    _this.clearUnavailableTimer();
                    _this.setConnection(handshake.connection);
                    _this.socket_id = _this.connection.id;
                    _this.updateState("connected", { socket_id: _this.socket_id });
                }
            });
        };
        ConnectionManager.prototype.buildErrorCallbacks = function () {
            var _this = this;
            var withErrorEmitted = function (callback) {
                return function (result) {
                    if (result.error) {
                        _this.emit("error", { type: "WebSocketError", error: result.error });
                    }
                    callback(result);
                };
            };
            return {
                tls_only: withErrorEmitted(function () {
                    _this.usingTLS = true;
                    _this.updateStrategy();
                    _this.retryIn(0);
                }),
                refused: withErrorEmitted(function () {
                    _this.disconnect();
                }),
                backoff: withErrorEmitted(function () {
                    _this.retryIn(1000);
                }),
                retry: withErrorEmitted(function () {
                    _this.retryIn(0);
                })
            };
        };
        ConnectionManager.prototype.setConnection = function (connection) {
            this.connection = connection;
            for (var event in this.connectionCallbacks) {
                this.connection.bind(event, this.connectionCallbacks[event]);
            }
            this.resetActivityCheck();
        };
        ConnectionManager.prototype.abandonConnection = function () {
            if (!this.connection) {
                return;
            }
            this.stopActivityCheck();
            for (var event in this.connectionCallbacks) {
                this.connection.unbind(event, this.connectionCallbacks[event]);
            }
            var connection = this.connection;
            this.connection = null;
            return connection;
        };
        ConnectionManager.prototype.updateState = function (newState, data) {
            var previousState = this.state;
            this.state = newState;
            if (previousState !== newState) {
                var newStateDescription = newState;
                if (newStateDescription === "connected") {
                    newStateDescription += " with new socket ID " + data.socket_id;
                }
                logger.debug('State changed', previousState + ' -> ' + newStateDescription);
                this.timeline.info({ state: newState, params: data });
                this.emit('state_change', { previous: previousState, current: newState });
                this.emit(newState, data);
            }
        };
        ConnectionManager.prototype.shouldRetry = function () {
            return this.state === "connecting" || this.state === "connected";
        };
        return ConnectionManager;
    }(dispatcher));
    /* harmony default export */ var connection_manager = (connection_manager_ConnectionManager);

    // CONCATENATED MODULE: ./src/core/channels/channels.ts



    var channels_Channels = (function () {
        function Channels() {
            this.channels = {};
        }
        Channels.prototype.add = function (name, pusher) {
            if (!this.channels[name]) {
                this.channels[name] = createChannel(name, pusher);
            }
            return this.channels[name];
        };
        Channels.prototype.all = function () {
            return values(this.channels);
        };
        Channels.prototype.find = function (name) {
            return this.channels[name];
        };
        Channels.prototype.remove = function (name) {
            var channel = this.channels[name];
            delete this.channels[name];
            return channel;
        };
        Channels.prototype.disconnect = function () {
            objectApply(this.channels, function (channel) {
                channel.disconnect();
            });
        };
        return Channels;
    }());
    /* harmony default export */ var channels = (channels_Channels);
    function createChannel(name, pusher) {
        if (name.indexOf('private-encrypted-') === 0) {
            return factory.createEncryptedChannel(name, pusher);
        }
        else if (name.indexOf('private-') === 0) {
            return factory.createPrivateChannel(name, pusher);
        }
        else if (name.indexOf('presence-') === 0) {
            return factory.createPresenceChannel(name, pusher);
        }
        else {
            return factory.createChannel(name, pusher);
        }
    }

    // CONCATENATED MODULE: ./src/core/utils/factory.ts










    var Factory = {
        createChannels: function () {
            return new channels();
        },
        createConnectionManager: function (key, options) {
            return new connection_manager(key, options);
        },
        createChannel: function (name, pusher) {
            return new channels_channel(name, pusher);
        },
        createPrivateChannel: function (name, pusher) {
            return new private_channel(name, pusher);
        },
        createPresenceChannel: function (name, pusher) {
            return new presence_channel(name, pusher);
        },
        createEncryptedChannel: function (name, pusher) {
            return new encrypted_channel(name, pusher);
        },
        createTimelineSender: function (timeline, options) {
            return new timeline_sender(timeline, options);
        },
        createAuthorizer: function (channel, options) {
            if (options.authorizer) {
                return options.authorizer(channel, options);
            }
            return new pusher_authorizer(channel, options);
        },
        createHandshake: function (transport, callback) {
            return new connection_handshake(transport, callback);
        },
        createAssistantToTheTransportManager: function (manager, transport, options) {
            return new assistant_to_the_transport_manager(manager, transport, options);
        }
    };
    /* harmony default export */ var factory = (Factory);

    // CONCATENATED MODULE: ./src/core/transports/transport_manager.ts

    var transport_manager_TransportManager = (function () {
        function TransportManager(options) {
            this.options = options || {};
            this.livesLeft = this.options.lives || Infinity;
        }
        TransportManager.prototype.getAssistant = function (transport) {
            return factory.createAssistantToTheTransportManager(this, transport, {
                minPingDelay: this.options.minPingDelay,
                maxPingDelay: this.options.maxPingDelay
            });
        };
        TransportManager.prototype.isAlive = function () {
            return this.livesLeft > 0;
        };
        TransportManager.prototype.reportDeath = function () {
            this.livesLeft -= 1;
        };
        return TransportManager;
    }());
    /* harmony default export */ var transport_manager = (transport_manager_TransportManager);

    // CONCATENATED MODULE: ./src/core/strategies/sequential_strategy.ts



    var sequential_strategy_SequentialStrategy = (function () {
        function SequentialStrategy(strategies, options) {
            this.strategies = strategies;
            this.loop = Boolean(options.loop);
            this.failFast = Boolean(options.failFast);
            this.timeout = options.timeout;
            this.timeoutLimit = options.timeoutLimit;
        }
        SequentialStrategy.prototype.isSupported = function () {
            return any(this.strategies, util.method("isSupported"));
        };
        SequentialStrategy.prototype.connect = function (minPriority, callback) {
            var _this = this;
            var strategies = this.strategies;
            var current = 0;
            var timeout = this.timeout;
            var runner = null;
            var tryNextStrategy = function (error, handshake) {
                if (handshake) {
                    callback(null, handshake);
                }
                else {
                    current = current + 1;
                    if (_this.loop) {
                        current = current % strategies.length;
                    }
                    if (current < strategies.length) {
                        if (timeout) {
                            timeout = timeout * 2;
                            if (_this.timeoutLimit) {
                                timeout = Math.min(timeout, _this.timeoutLimit);
                            }
                        }
                        runner = _this.tryStrategy(strategies[current], minPriority, { timeout: timeout, failFast: _this.failFast }, tryNextStrategy);
                    }
                    else {
                        callback(true);
                    }
                }
            };
            runner = this.tryStrategy(strategies[current], minPriority, { timeout: timeout, failFast: this.failFast }, tryNextStrategy);
            return {
                abort: function () {
                    runner.abort();
                },
                forceMinPriority: function (p) {
                    minPriority = p;
                    if (runner) {
                        runner.forceMinPriority(p);
                    }
                }
            };
        };
        SequentialStrategy.prototype.tryStrategy = function (strategy, minPriority, options, callback) {
            var timer = null;
            var runner = null;
            if (options.timeout > 0) {
                timer = new OneOffTimer(options.timeout, function () {
                    runner.abort();
                    callback(true);
                });
            }
            runner = strategy.connect(minPriority, function (error, handshake) {
                if (error && timer && timer.isRunning() && !options.failFast) {
                    return;
                }
                if (timer) {
                    timer.ensureAborted();
                }
                callback(error, handshake);
            });
            return {
                abort: function () {
                    if (timer) {
                        timer.ensureAborted();
                    }
                    runner.abort();
                },
                forceMinPriority: function (p) {
                    runner.forceMinPriority(p);
                }
            };
        };
        return SequentialStrategy;
    }());
    /* harmony default export */ var sequential_strategy = (sequential_strategy_SequentialStrategy);

    // CONCATENATED MODULE: ./src/core/strategies/best_connected_ever_strategy.ts


    var best_connected_ever_strategy_BestConnectedEverStrategy = (function () {
        function BestConnectedEverStrategy(strategies) {
            this.strategies = strategies;
        }
        BestConnectedEverStrategy.prototype.isSupported = function () {
            return any(this.strategies, util.method("isSupported"));
        };
        BestConnectedEverStrategy.prototype.connect = function (minPriority, callback) {
            return connect(this.strategies, minPriority, function (i, runners) {
                return function (error, handshake) {
                    runners[i].error = error;
                    if (error) {
                        if (allRunnersFailed(runners)) {
                            callback(true);
                        }
                        return;
                    }
                    apply(runners, function (runner) {
                        runner.forceMinPriority(handshake.transport.priority);
                    });
                    callback(null, handshake);
                };
            });
        };
        return BestConnectedEverStrategy;
    }());
    /* harmony default export */ var best_connected_ever_strategy = (best_connected_ever_strategy_BestConnectedEverStrategy);
    function connect(strategies, minPriority, callbackBuilder) {
        var runners = map(strategies, function (strategy, i, _, rs) {
            return strategy.connect(minPriority, callbackBuilder(i, rs));
        });
        return {
            abort: function () {
                apply(runners, abortRunner);
            },
            forceMinPriority: function (p) {
                apply(runners, function (runner) {
                    runner.forceMinPriority(p);
                });
            }
        };
    }
    function allRunnersFailed(runners) {
        return collections_all(runners, function (runner) {
            return Boolean(runner.error);
        });
    }
    function abortRunner(runner) {
        if (!runner.error && !runner.aborted) {
            runner.abort();
            runner.aborted = true;
        }
    }

    // CONCATENATED MODULE: ./src/core/strategies/cached_strategy.ts




    var cached_strategy_CachedStrategy = (function () {
        function CachedStrategy(strategy, transports, options) {
            this.strategy = strategy;
            this.transports = transports;
            this.ttl = options.ttl || 1800 * 1000;
            this.usingTLS = options.useTLS;
            this.timeline = options.timeline;
        }
        CachedStrategy.prototype.isSupported = function () {
            return this.strategy.isSupported();
        };
        CachedStrategy.prototype.connect = function (minPriority, callback) {
            var usingTLS = this.usingTLS;
            var info = fetchTransportCache(usingTLS);
            var strategies = [this.strategy];
            if (info && info.timestamp + this.ttl >= util.now()) {
                var transport = this.transports[info.transport];
                if (transport) {
                    this.timeline.info({
                        cached: true,
                        transport: info.transport,
                        latency: info.latency
                    });
                    strategies.push(new sequential_strategy([transport], {
                        timeout: info.latency * 2 + 1000,
                        failFast: true
                    }));
                }
            }
            var startTimestamp = util.now();
            var runner = strategies.pop().connect(minPriority, function cb(error, handshake) {
                if (error) {
                    flushTransportCache(usingTLS);
                    if (strategies.length > 0) {
                        startTimestamp = util.now();
                        runner = strategies.pop().connect(minPriority, cb);
                    }
                    else {
                        callback(error);
                    }
                }
                else {
                    storeTransportCache(usingTLS, handshake.transport.name, util.now() - startTimestamp);
                    callback(null, handshake);
                }
            });
            return {
                abort: function () {
                    runner.abort();
                },
                forceMinPriority: function (p) {
                    minPriority = p;
                    if (runner) {
                        runner.forceMinPriority(p);
                    }
                }
            };
        };
        return CachedStrategy;
    }());
    /* harmony default export */ var cached_strategy = (cached_strategy_CachedStrategy);
    function getTransportCacheKey(usingTLS) {
        return "pusherTransport" + (usingTLS ? "TLS" : "NonTLS");
    }
    function fetchTransportCache(usingTLS) {
        var storage = runtime.getLocalStorage();
        if (storage) {
            try {
                var serializedCache = storage[getTransportCacheKey(usingTLS)];
                if (serializedCache) {
                    return JSON.parse(serializedCache);
                }
            }
            catch (e) {
                flushTransportCache(usingTLS);
            }
        }
        return null;
    }
    function storeTransportCache(usingTLS, transport, latency) {
        var storage = runtime.getLocalStorage();
        if (storage) {
            try {
                storage[getTransportCacheKey(usingTLS)] = safeJSONStringify({
                    timestamp: util.now(),
                    transport: transport,
                    latency: latency
                });
            }
            catch (e) {
            }
        }
    }
    function flushTransportCache(usingTLS) {
        var storage = runtime.getLocalStorage();
        if (storage) {
            try {
                delete storage[getTransportCacheKey(usingTLS)];
            }
            catch (e) {
            }
        }
    }

    // CONCATENATED MODULE: ./src/core/strategies/delayed_strategy.ts

    var delayed_strategy_DelayedStrategy = (function () {
        function DelayedStrategy(strategy, _a) {
            var number = _a.delay;
            this.strategy = strategy;
            this.options = { delay: number };
        }
        DelayedStrategy.prototype.isSupported = function () {
            return this.strategy.isSupported();
        };
        DelayedStrategy.prototype.connect = function (minPriority, callback) {
            var strategy = this.strategy;
            var runner;
            var timer = new OneOffTimer(this.options.delay, function () {
                runner = strategy.connect(minPriority, callback);
            });
            return {
                abort: function () {
                    timer.ensureAborted();
                    if (runner) {
                        runner.abort();
                    }
                },
                forceMinPriority: function (p) {
                    minPriority = p;
                    if (runner) {
                        runner.forceMinPriority(p);
                    }
                }
            };
        };
        return DelayedStrategy;
    }());
    /* harmony default export */ var delayed_strategy = (delayed_strategy_DelayedStrategy);

    // CONCATENATED MODULE: ./src/core/strategies/if_strategy.ts
    var IfStrategy = (function () {
        function IfStrategy(test, trueBranch, falseBranch) {
            this.test = test;
            this.trueBranch = trueBranch;
            this.falseBranch = falseBranch;
        }
        IfStrategy.prototype.isSupported = function () {
            var branch = this.test() ? this.trueBranch : this.falseBranch;
            return branch.isSupported();
        };
        IfStrategy.prototype.connect = function (minPriority, callback) {
            var branch = this.test() ? this.trueBranch : this.falseBranch;
            return branch.connect(minPriority, callback);
        };
        return IfStrategy;
    }());
    /* harmony default export */ var if_strategy = (IfStrategy);

    // CONCATENATED MODULE: ./src/core/strategies/first_connected_strategy.ts
    var FirstConnectedStrategy = (function () {
        function FirstConnectedStrategy(strategy) {
            this.strategy = strategy;
        }
        FirstConnectedStrategy.prototype.isSupported = function () {
            return this.strategy.isSupported();
        };
        FirstConnectedStrategy.prototype.connect = function (minPriority, callback) {
            var runner = this.strategy.connect(minPriority, function (error, handshake) {
                if (handshake) {
                    runner.abort();
                }
                callback(error, handshake);
            });
            return runner;
        };
        return FirstConnectedStrategy;
    }());
    /* harmony default export */ var first_connected_strategy = (FirstConnectedStrategy);

    // CONCATENATED MODULE: ./src/runtimes/web/default_strategy.ts








    function testSupportsStrategy(strategy) {
        return function () {
            return strategy.isSupported();
        };
    }
    var getDefaultStrategy = function (config, defineTransport) {
        var definedTransports = {};
        function defineTransportStrategy(name, type, priority, options, manager) {
            var transport = defineTransport(config, name, type, priority, options, manager);
            definedTransports[name] = transport;
            return transport;
        }
        var ws_options = {
            hostNonTLS: config.wsHost + ":" + config.wsPort,
            hostTLS: config.wsHost + ":" + config.wssPort,
            httpPath: config.wsPath
        };
        var wss_options = extend({}, ws_options, {
            useTLS: true
        });
        var sockjs_options = {
            hostNonTLS: config.httpHost + ":" + config.httpPort,
            hostTLS: config.httpHost + ":" + config.httpsPort,
            httpPath: config.httpPath
        };
        var timeouts = {
            loop: true,
            timeout: 15000,
            timeoutLimit: 60000
        };
        var ws_manager = new transport_manager({
            lives: 2,
            minPingDelay: 10000,
            maxPingDelay: config.activity_timeout
        });
        var streaming_manager = new transport_manager({
            lives: 2,
            minPingDelay: 10000,
            maxPingDelay: config.activity_timeout
        });
        var ws_transport = defineTransportStrategy("ws", "ws", 3, ws_options, ws_manager);
        var wss_transport = defineTransportStrategy("wss", "ws", 3, wss_options, ws_manager);
        var sockjs_transport = defineTransportStrategy("sockjs", "sockjs", 1, sockjs_options);
        var xhr_streaming_transport = defineTransportStrategy("xhr_streaming", "xhr_streaming", 1, sockjs_options, streaming_manager);
        var xdr_streaming_transport = defineTransportStrategy("xdr_streaming", "xdr_streaming", 1, sockjs_options, streaming_manager);
        var xhr_polling_transport = defineTransportStrategy("xhr_polling", "xhr_polling", 1, sockjs_options);
        var xdr_polling_transport = defineTransportStrategy("xdr_polling", "xdr_polling", 1, sockjs_options);
        var ws_loop = new sequential_strategy([ws_transport], timeouts);
        var wss_loop = new sequential_strategy([wss_transport], timeouts);
        var sockjs_loop = new sequential_strategy([sockjs_transport], timeouts);
        var streaming_loop = new sequential_strategy([new if_strategy(testSupportsStrategy(xhr_streaming_transport), xhr_streaming_transport, xdr_streaming_transport)], timeouts);
        var polling_loop = new sequential_strategy([new if_strategy(testSupportsStrategy(xhr_polling_transport), xhr_polling_transport, xdr_polling_transport)], timeouts);
        var http_loop = new sequential_strategy([new if_strategy(testSupportsStrategy(streaming_loop), new best_connected_ever_strategy([streaming_loop, new delayed_strategy(polling_loop, { delay: 4000 })]), polling_loop)], timeouts);
        var http_fallback_loop = new if_strategy(testSupportsStrategy(http_loop), http_loop, sockjs_loop);
        var wsStrategy;
        if (config.useTLS) {
            wsStrategy = new best_connected_ever_strategy([ws_loop, new delayed_strategy(http_fallback_loop, { delay: 2000 })]);
        }
        else {
            wsStrategy = new best_connected_ever_strategy([
                ws_loop,
                new delayed_strategy(wss_loop, { delay: 2000 }),
                new delayed_strategy(http_fallback_loop, { delay: 5000 })
            ]);
        }
        return new cached_strategy(new first_connected_strategy(new if_strategy(testSupportsStrategy(ws_transport), wsStrategy, http_fallback_loop)), definedTransports, {
            ttl: 1800000,
            timeline: config.timeline,
            useTLS: config.useTLS
        });
    };
    /* harmony default export */ var default_strategy = (getDefaultStrategy);

    // CONCATENATED MODULE: ./src/runtimes/web/transports/transport_connection_initializer.ts

    /* harmony default export */ var transport_connection_initializer = (function () {
        var self = this;
        self.timeline.info(self.buildTimelineMessage({
            transport: self.name + (self.options.useTLS ? "s" : "")
        }));
        if (self.hooks.isInitialized()) {
            self.changeState("initialized");
        }
        else if (self.hooks.file) {
            self.changeState("initializing");
            Dependencies.load(self.hooks.file, { useTLS: self.options.useTLS }, function (error, callback) {
                if (self.hooks.isInitialized()) {
                    self.changeState("initialized");
                    callback(true);
                }
                else {
                    if (error) {
                        self.onError(error);
                    }
                    self.onClose();
                    callback(false);
                }
            });
        }
        else {
            self.onClose();
        }
    });

    // CONCATENATED MODULE: ./src/runtimes/web/http/http_xdomain_request.ts

    var http_xdomain_request_hooks = {
        getRequest: function (socket) {
            var xdr = new window.XDomainRequest();
            xdr.ontimeout = function () {
                socket.emit("error", new RequestTimedOut());
                socket.close();
            };
            xdr.onerror = function (e) {
                socket.emit("error", e);
                socket.close();
            };
            xdr.onprogress = function () {
                if (xdr.responseText && xdr.responseText.length > 0) {
                    socket.onChunk(200, xdr.responseText);
                }
            };
            xdr.onload = function () {
                if (xdr.responseText && xdr.responseText.length > 0) {
                    socket.onChunk(200, xdr.responseText);
                }
                socket.emit("finished", 200);
                socket.close();
            };
            return xdr;
        },
        abortRequest: function (xdr) {
            xdr.ontimeout = xdr.onerror = xdr.onprogress = xdr.onload = null;
            xdr.abort();
        }
    };
    /* harmony default export */ var http_xdomain_request = (http_xdomain_request_hooks);

    // CONCATENATED MODULE: ./src/core/http/http_request.ts
    var http_request_extends =  (function () {
        var extendStatics = function (d, b) {
            extendStatics = Object.setPrototypeOf ||
                ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
                function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
            return extendStatics(d, b);
        };
        return function (d, b) {
            extendStatics(d, b);
            function __() { this.constructor = d; }
            d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
    })();


    var MAX_BUFFER_LENGTH = 256 * 1024;
    var http_request_HTTPRequest = (function (_super) {
        http_request_extends(HTTPRequest, _super);
        function HTTPRequest(hooks, method, url) {
            var _this = _super.call(this) || this;
            _this.hooks = hooks;
            _this.method = method;
            _this.url = url;
            return _this;
        }
        HTTPRequest.prototype.start = function (payload) {
            var _this = this;
            this.position = 0;
            this.xhr = this.hooks.getRequest(this);
            this.unloader = function () {
                _this.close();
            };
            runtime.addUnloadListener(this.unloader);
            this.xhr.open(this.method, this.url, true);
            if (this.xhr.setRequestHeader) {
                this.xhr.setRequestHeader("Content-Type", "application/json");
            }
            this.xhr.send(payload);
        };
        HTTPRequest.prototype.close = function () {
            if (this.unloader) {
                runtime.removeUnloadListener(this.unloader);
                this.unloader = null;
            }
            if (this.xhr) {
                this.hooks.abortRequest(this.xhr);
                this.xhr = null;
            }
        };
        HTTPRequest.prototype.onChunk = function (status, data) {
            while (true) {
                var chunk = this.advanceBuffer(data);
                if (chunk) {
                    this.emit("chunk", { status: status, data: chunk });
                }
                else {
                    break;
                }
            }
            if (this.isBufferTooLong(data)) {
                this.emit("buffer_too_long");
            }
        };
        HTTPRequest.prototype.advanceBuffer = function (buffer) {
            var unreadData = buffer.slice(this.position);
            var endOfLinePosition = unreadData.indexOf("\n");
            if (endOfLinePosition !== -1) {
                this.position += endOfLinePosition + 1;
                return unreadData.slice(0, endOfLinePosition);
            }
            else {
                return null;
            }
        };
        HTTPRequest.prototype.isBufferTooLong = function (buffer) {
            return this.position === buffer.length && buffer.length > MAX_BUFFER_LENGTH;
        };
        return HTTPRequest;
    }(dispatcher));
    /* harmony default export */ var http_request = (http_request_HTTPRequest);

    // CONCATENATED MODULE: ./src/core/http/state.ts
    var State;
    (function (State) {
        State[State["CONNECTING"] = 0] = "CONNECTING";
        State[State["OPEN"] = 1] = "OPEN";
        State[State["CLOSED"] = 3] = "CLOSED";
    })(State || (State = {}));
    /* harmony default export */ var state = (State);

    // CONCATENATED MODULE: ./src/core/http/http_socket.ts



    var autoIncrement = 1;
    var http_socket_HTTPSocket = (function () {
        function HTTPSocket(hooks, url) {
            this.hooks = hooks;
            this.session = randomNumber(1000) + "/" + randomString(8);
            this.location = getLocation(url);
            this.readyState = state.CONNECTING;
            this.openStream();
        }
        HTTPSocket.prototype.send = function (payload) {
            return this.sendRaw(JSON.stringify([payload]));
        };
        HTTPSocket.prototype.ping = function () {
            this.hooks.sendHeartbeat(this);
        };
        HTTPSocket.prototype.close = function (code, reason) {
            this.onClose(code, reason, true);
        };
        HTTPSocket.prototype.sendRaw = function (payload) {
            if (this.readyState === state.OPEN) {
                try {
                    runtime.createSocketRequest("POST", getUniqueURL(getSendURL(this.location, this.session))).start(payload);
                    return true;
                }
                catch (e) {
                    return false;
                }
            }
            else {
                return false;
            }
        };
        HTTPSocket.prototype.reconnect = function () {
            this.closeStream();
            this.openStream();
        };
        HTTPSocket.prototype.onClose = function (code, reason, wasClean) {
            this.closeStream();
            this.readyState = state.CLOSED;
            if (this.onclose) {
                this.onclose({
                    code: code,
                    reason: reason,
                    wasClean: wasClean
                });
            }
        };
        HTTPSocket.prototype.onChunk = function (chunk) {
            if (chunk.status !== 200) {
                return;
            }
            if (this.readyState === state.OPEN) {
                this.onActivity();
            }
            var payload;
            var type = chunk.data.slice(0, 1);
            switch (type) {
                case 'o':
                    payload = JSON.parse(chunk.data.slice(1) || '{}');
                    this.onOpen(payload);
                    break;
                case 'a':
                    payload = JSON.parse(chunk.data.slice(1) || '[]');
                    for (var i = 0; i < payload.length; i++) {
                        this.onEvent(payload[i]);
                    }
                    break;
                case 'm':
                    payload = JSON.parse(chunk.data.slice(1) || 'null');
                    this.onEvent(payload);
                    break;
                case 'h':
                    this.hooks.onHeartbeat(this);
                    break;
                case 'c':
                    payload = JSON.parse(chunk.data.slice(1) || '[]');
                    this.onClose(payload[0], payload[1], true);
                    break;
            }
        };
        HTTPSocket.prototype.onOpen = function (options) {
            if (this.readyState === state.CONNECTING) {
                if (options && options.hostname) {
                    this.location.base = replaceHost(this.location.base, options.hostname);
                }
                this.readyState = state.OPEN;
                if (this.onopen) {
                    this.onopen();
                }
            }
            else {
                this.onClose(1006, "Server lost session", true);
            }
        };
        HTTPSocket.prototype.onEvent = function (event) {
            if (this.readyState === state.OPEN && this.onmessage) {
                this.onmessage({ data: event });
            }
        };
        HTTPSocket.prototype.onActivity = function () {
            if (this.onactivity) {
                this.onactivity();
            }
        };
        HTTPSocket.prototype.onError = function (error) {
            if (this.onerror) {
                this.onerror(error);
            }
        };
        HTTPSocket.prototype.openStream = function () {
            var _this = this;
            this.stream = runtime.createSocketRequest("POST", getUniqueURL(this.hooks.getReceiveURL(this.location, this.session)));
            this.stream.bind("chunk", function (chunk) {
                _this.onChunk(chunk);
            });
            this.stream.bind("finished", function (status) {
                _this.hooks.onFinished(_this, status);
            });
            this.stream.bind("buffer_too_long", function () {
                _this.reconnect();
            });
            try {
                this.stream.start();
            }
            catch (error) {
                util.defer(function () {
                    _this.onError(error);
                    _this.onClose(1006, "Could not start streaming", false);
                });
            }
        };
        HTTPSocket.prototype.closeStream = function () {
            if (this.stream) {
                this.stream.unbind_all();
                this.stream.close();
                this.stream = null;
            }
        };
        return HTTPSocket;
    }());
    function getLocation(url) {
        var parts = /([^\?]*)\/*(\??.*)/.exec(url);
        return {
            base: parts[1],
            queryString: parts[2]
        };
    }
    function getSendURL(url, session) {
        return url.base + "/" + session + "/xhr_send";
    }
    function getUniqueURL(url) {
        var separator = (url.indexOf('?') === -1) ? "?" : "&";
        return url + separator + "t=" + (+new Date()) + "&n=" + autoIncrement++;
    }
    function replaceHost(url, hostname) {
        var urlParts = /(https?:\/\/)([^\/:]+)((\/|:)?.*)/.exec(url);
        return urlParts[1] + hostname + urlParts[3];
    }
    function randomNumber(max) {
        return Math.floor(Math.random() * max);
    }
    function randomString(length) {
        var result = [];
        for (var i = 0; i < length; i++) {
            result.push(randomNumber(32).toString(32));
        }
        return result.join('');
    }
    /* harmony default export */ var http_socket = (http_socket_HTTPSocket);

    // CONCATENATED MODULE: ./src/core/http/http_streaming_socket.ts
    var http_streaming_socket_hooks = {
        getReceiveURL: function (url, session) {
            return url.base + "/" + session + "/xhr_streaming" + url.queryString;
        },
        onHeartbeat: function (socket) {
            socket.sendRaw("[]");
        },
        sendHeartbeat: function (socket) {
            socket.sendRaw("[]");
        },
        onFinished: function (socket, status) {
            socket.onClose(1006, "Connection interrupted (" + status + ")", false);
        }
    };
    /* harmony default export */ var http_streaming_socket = (http_streaming_socket_hooks);

    // CONCATENATED MODULE: ./src/core/http/http_polling_socket.ts
    var http_polling_socket_hooks = {
        getReceiveURL: function (url, session) {
            return url.base + "/" + session + "/xhr" + url.queryString;
        },
        onHeartbeat: function () {
        },
        sendHeartbeat: function (socket) {
            socket.sendRaw("[]");
        },
        onFinished: function (socket, status) {
            if (status === 200) {
                socket.reconnect();
            }
            else {
                socket.onClose(1006, "Connection interrupted (" + status + ")", false);
            }
        }
    };
    /* harmony default export */ var http_polling_socket = (http_polling_socket_hooks);

    // CONCATENATED MODULE: ./src/runtimes/isomorphic/http/http_xhr_request.ts

    var http_xhr_request_hooks = {
        getRequest: function (socket) {
            var Constructor = runtime.getXHRAPI();
            var xhr = new Constructor();
            xhr.onreadystatechange = xhr.onprogress = function () {
                switch (xhr.readyState) {
                    case 3:
                        if (xhr.responseText && xhr.responseText.length > 0) {
                            socket.onChunk(xhr.status, xhr.responseText);
                        }
                        break;
                    case 4:
                        if (xhr.responseText && xhr.responseText.length > 0) {
                            socket.onChunk(xhr.status, xhr.responseText);
                        }
                        socket.emit("finished", xhr.status);
                        socket.close();
                        break;
                }
            };
            return xhr;
        },
        abortRequest: function (xhr) {
            xhr.onreadystatechange = null;
            xhr.abort();
        }
    };
    /* harmony default export */ var http_xhr_request = (http_xhr_request_hooks);

    // CONCATENATED MODULE: ./src/runtimes/isomorphic/http/http.ts





    var HTTP = {
        createStreamingSocket: function (url) {
            return this.createSocket(http_streaming_socket, url);
        },
        createPollingSocket: function (url) {
            return this.createSocket(http_polling_socket, url);
        },
        createSocket: function (hooks, url) {
            return new http_socket(hooks, url);
        },
        createXHR: function (method, url) {
            return this.createRequest(http_xhr_request, method, url);
        },
        createRequest: function (hooks, method, url) {
            return new http_request(hooks, method, url);
        }
    };
    /* harmony default export */ var http_http = (HTTP);

    // CONCATENATED MODULE: ./src/runtimes/web/http/http.ts


    http_http.createXDR = function (method, url) {
        return this.createRequest(http_xdomain_request, method, url);
    };
    /* harmony default export */ var web_http_http = (http_http);

    // CONCATENATED MODULE: ./src/runtimes/web/runtime.ts












    var Runtime = {
        nextAuthCallbackID: 1,
        auth_callbacks: {},
        ScriptReceivers: ScriptReceivers,
        DependenciesReceivers: DependenciesReceivers,
        getDefaultStrategy: default_strategy,
        Transports: transports_transports,
        transportConnectionInitializer: transport_connection_initializer,
        HTTPFactory: web_http_http,
        TimelineTransport: jsonp_timeline,
        getXHRAPI: function () {
            return window.XMLHttpRequest;
        },
        getWebSocketAPI: function () {
            return window.WebSocket || window.MozWebSocket;
        },
        setup: function (PusherClass) {
            var _this = this;
            window.Pusher = PusherClass;
            var initializeOnDocumentBody = function () {
                _this.onDocumentBody(PusherClass.ready);
            };
            if (!window.JSON) {
                Dependencies.load("json2", {}, initializeOnDocumentBody);
            }
            else {
                initializeOnDocumentBody();
            }
        },
        getDocument: function () {
            return document;
        },
        getProtocol: function () {
            return this.getDocument().location.protocol;
        },
        getAuthorizers: function () {
            return { ajax: xhr_auth, jsonp: jsonp_auth };
        },
        onDocumentBody: function (callback) {
            var _this = this;
            if (document.body) {
                callback();
            }
            else {
                setTimeout(function () {
                    _this.onDocumentBody(callback);
                }, 0);
            }
        },
        createJSONPRequest: function (url, data) {
            return new jsonp_request(url, data);
        },
        createScriptRequest: function (src) {
            return new script_request(src);
        },
        getLocalStorage: function () {
            try {
                return window.localStorage;
            }
            catch (e) {
                return undefined;
            }
        },
        createXHR: function () {
            if (this.getXHRAPI()) {
                return this.createXMLHttpRequest();
            }
            else {
                return this.createMicrosoftXHR();
            }
        },
        createXMLHttpRequest: function () {
            var Constructor = this.getXHRAPI();
            return new Constructor();
        },
        createMicrosoftXHR: function () {
            return new ActiveXObject("Microsoft.XMLHTTP");
        },
        getNetwork: function () {
            return net_info_Network;
        },
        createWebSocket: function (url) {
            var Constructor = this.getWebSocketAPI();
            return new Constructor(url);
        },
        createSocketRequest: function (method, url) {
            if (this.isXHRSupported()) {
                return this.HTTPFactory.createXHR(method, url);
            }
            else if (this.isXDRSupported(url.indexOf("https:") === 0)) {
                return this.HTTPFactory.createXDR(method, url);
            }
            else {
                throw "Cross-origin HTTP requests are not supported";
            }
        },
        isXHRSupported: function () {
            var Constructor = this.getXHRAPI();
            return Boolean(Constructor) && (new Constructor()).withCredentials !== undefined;
        },
        isXDRSupported: function (useTLS) {
            var protocol = useTLS ? "https:" : "http:";
            var documentProtocol = this.getProtocol();
            return Boolean((window['XDomainRequest'])) && documentProtocol === protocol;
        },
        addUnloadListener: function (listener) {
            if (window.addEventListener !== undefined) {
                window.addEventListener("unload", listener, false);
            }
            else if (window.attachEvent !== undefined) {
                window.attachEvent("onunload", listener);
            }
        },
        removeUnloadListener: function (listener) {
            if (window.addEventListener !== undefined) {
                window.removeEventListener("unload", listener, false);
            }
            else if (window.detachEvent !== undefined) {
                window.detachEvent("onunload", listener);
            }
        }
    };
    /* harmony default export */ var runtime = (Runtime);

    // CONCATENATED MODULE: ./src/core/timeline/level.ts
    var TimelineLevel;
    (function (TimelineLevel) {
        TimelineLevel[TimelineLevel["ERROR"] = 3] = "ERROR";
        TimelineLevel[TimelineLevel["INFO"] = 6] = "INFO";
        TimelineLevel[TimelineLevel["DEBUG"] = 7] = "DEBUG";
    })(TimelineLevel || (TimelineLevel = {}));
    /* harmony default export */ var timeline_level = (TimelineLevel);

    // CONCATENATED MODULE: ./src/core/timeline/timeline.ts



    var timeline_Timeline = (function () {
        function Timeline(key, session, options) {
            this.key = key;
            this.session = session;
            this.events = [];
            this.options = options || {};
            this.sent = 0;
            this.uniqueID = 0;
        }
        Timeline.prototype.log = function (level, event) {
            if (level <= this.options.level) {
                this.events.push(extend({}, event, { timestamp: util.now() }));
                if (this.options.limit && this.events.length > this.options.limit) {
                    this.events.shift();
                }
            }
        };
        Timeline.prototype.error = function (event) {
            this.log(timeline_level.ERROR, event);
        };
        Timeline.prototype.info = function (event) {
            this.log(timeline_level.INFO, event);
        };
        Timeline.prototype.debug = function (event) {
            this.log(timeline_level.DEBUG, event);
        };
        Timeline.prototype.isEmpty = function () {
            return this.events.length === 0;
        };
        Timeline.prototype.send = function (sendfn, callback) {
            var _this = this;
            var data = extend({
                session: this.session,
                bundle: this.sent + 1,
                key: this.key,
                lib: "js",
                version: this.options.version,
                cluster: this.options.cluster,
                features: this.options.features,
                timeline: this.events
            }, this.options.params);
            this.events = [];
            sendfn(data, function (error, result) {
                if (!error) {
                    _this.sent++;
                }
                if (callback) {
                    callback(error, result);
                }
            });
            return true;
        };
        Timeline.prototype.generateUniqueID = function () {
            this.uniqueID++;
            return this.uniqueID;
        };
        return Timeline;
    }());
    /* harmony default export */ var timeline_timeline = (timeline_Timeline);

    // CONCATENATED MODULE: ./src/core/strategies/transport_strategy.ts




    var transport_strategy_TransportStrategy = (function () {
        function TransportStrategy(name, priority, transport, options) {
            this.name = name;
            this.priority = priority;
            this.transport = transport;
            this.options = options || {};
        }
        TransportStrategy.prototype.isSupported = function () {
            return this.transport.isSupported({
                useTLS: this.options.useTLS
            });
        };
        TransportStrategy.prototype.connect = function (minPriority, callback) {
            var _this = this;
            if (!this.isSupported()) {
                return failAttempt(new UnsupportedStrategy(), callback);
            }
            else if (this.priority < minPriority) {
                return failAttempt(new TransportPriorityTooLow(), callback);
            }
            var connected = false;
            var transport = this.transport.createConnection(this.name, this.priority, this.options.key, this.options);
            var handshake = null;
            var onInitialized = function () {
                transport.unbind("initialized", onInitialized);
                transport.connect();
            };
            var onOpen = function () {
                handshake = factory.createHandshake(transport, function (result) {
                    connected = true;
                    unbindListeners();
                    callback(null, result);
                });
            };
            var onError = function (error) {
                unbindListeners();
                callback(error);
            };
            var onClosed = function () {
                unbindListeners();
                var serializedTransport;
                serializedTransport = safeJSONStringify(transport);
                callback(new TransportClosed(serializedTransport));
            };
            var unbindListeners = function () {
                transport.unbind("initialized", onInitialized);
                transport.unbind("open", onOpen);
                transport.unbind("error", onError);
                transport.unbind("closed", onClosed);
            };
            transport.bind("initialized", onInitialized);
            transport.bind("open", onOpen);
            transport.bind("error", onError);
            transport.bind("closed", onClosed);
            transport.initialize();
            return {
                abort: function () {
                    if (connected) {
                        return;
                    }
                    unbindListeners();
                    if (handshake) {
                        handshake.close();
                    }
                    else {
                        transport.close();
                    }
                },
                forceMinPriority: function (p) {
                    if (connected) {
                        return;
                    }
                    if (_this.priority < p) {
                        if (handshake) {
                            handshake.close();
                        }
                        else {
                            transport.close();
                        }
                    }
                }
            };
        };
        return TransportStrategy;
    }());
    /* harmony default export */ var transport_strategy = (transport_strategy_TransportStrategy);
    function failAttempt(error, callback) {
        util.defer(function () {
            callback(error);
        });
        return {
            abort: function () { },
            forceMinPriority: function () { }
        };
    }

    // CONCATENATED MODULE: ./src/core/strategies/strategy_builder.ts





    var strategy_builder_Transports = runtime.Transports;
    var strategy_builder_defineTransport = function (config, name, type, priority, options, manager) {
        var transportClass = strategy_builder_Transports[type];
        if (!transportClass) {
            throw new UnsupportedTransport(type);
        }
        var enabled = (!config.enabledTransports ||
            arrayIndexOf(config.enabledTransports, name) !== -1) &&
            (!config.disabledTransports ||
                arrayIndexOf(config.disabledTransports, name) === -1);
        var transport;
        if (enabled) {
            transport = new transport_strategy(name, priority, manager ? manager.getAssistant(transportClass) : transportClass, extend({
                key: config.key,
                useTLS: config.useTLS,
                timeline: config.timeline,
                ignoreNullOrigin: config.ignoreNullOrigin
            }, options));
        }
        else {
            transport = strategy_builder_UnsupportedStrategy;
        }
        return transport;
    };
    var strategy_builder_UnsupportedStrategy = {
        isSupported: function () {
            return false;
        },
        connect: function (_, callback) {
            var deferred = util.defer(function () {
                callback(new UnsupportedStrategy());
            });
            return {
                abort: function () {
                    deferred.ensureAborted();
                },
                forceMinPriority: function () { }
            };
        }
    };

    // CONCATENATED MODULE: ./src/core/config.ts

    var getGlobalConfig = function () {
        return {
            wsHost: defaults.host,
            wsPort: defaults.ws_port,
            wssPort: defaults.wss_port,
            wsPath: defaults.ws_path,
            httpHost: defaults.sockjs_host,
            httpPort: defaults.sockjs_http_port,
            httpsPort: defaults.sockjs_https_port,
            httpPath: defaults.sockjs_path,
            statsHost: defaults.stats_host,
            authEndpoint: defaults.channel_auth_endpoint,
            authTransport: defaults.channel_auth_transport,
            activity_timeout: defaults.activity_timeout,
            pong_timeout: defaults.pong_timeout,
            unavailable_timeout: defaults.unavailable_timeout
        };
    };
    var getClusterConfig = function (clusterName) {
        return {
            wsHost: 'ws-' + clusterName + '.pusher.com',
            httpHost: 'sockjs-' + clusterName + '.pusher.com'
        };
    };

    // CONCATENATED MODULE: ./src/core/pusher.ts












    var pusher_Pusher = (function () {
        function Pusher(app_key, options) {
            var _this = this;
            checkAppKey(app_key);
            options = options || {};
            if (!options.cluster && !(options.wsHost || options.httpHost)) {
                var suffix = url_store.buildLogSuffix('javascriptQuickStart');
                logger.warn("You should always specify a cluster when connecting. " + suffix);
            }
            this.key = app_key;
            this.config = extend(getGlobalConfig(), options.cluster ? getClusterConfig(options.cluster) : {}, options);
            this.channels = factory.createChannels();
            this.global_emitter = new dispatcher();
            this.sessionID = Math.floor(Math.random() * 1000000000);
            this.timeline = new timeline_timeline(this.key, this.sessionID, {
                cluster: this.config.cluster,
                features: Pusher.getClientFeatures(),
                params: this.config.timelineParams || {},
                limit: 50,
                level: timeline_level.INFO,
                version: defaults.VERSION
            });
            if (!this.config.disableStats) {
                this.timelineSender = factory.createTimelineSender(this.timeline, {
                    host: this.config.statsHost,
                    path: '/timeline/v2/' + runtime.TimelineTransport.name
                });
            }
            var getStrategy = function (options) {
                var config = extend({}, _this.config, options);
                return runtime.getDefaultStrategy(config, strategy_builder_defineTransport);
            };
            this.connection = factory.createConnectionManager(this.key, extend({
                getStrategy: getStrategy,
                timeline: this.timeline,
                activityTimeout: this.config.activity_timeout,
                pongTimeout: this.config.pong_timeout,
                unavailableTimeout: this.config.unavailable_timeout
            }, this.config, { useTLS: this.shouldUseTLS() }));
            this.connection.bind('connected', function () {
                _this.subscribeAll();
                if (_this.timelineSender) {
                    _this.timelineSender.send(_this.connection.isUsingTLS());
                }
            });
            this.connection.bind('message', function (event) {
                var eventName = event.event;
                var internal = eventName.indexOf('pusher_internal:') === 0;
                if (event.channel) {
                    var channel = _this.channel(event.channel);
                    if (channel) {
                        channel.handleEvent(event);
                    }
                }
                if (!internal) {
                    _this.global_emitter.emit(event.event, event.data);
                }
            });
            this.connection.bind('connecting', function () {
                _this.channels.disconnect();
            });
            this.connection.bind('disconnected', function () {
                _this.channels.disconnect();
            });
            this.connection.bind('error', function (err) {
                logger.warn('Error', err);
            });
            Pusher.instances.push(this);
            this.timeline.info({ instances: Pusher.instances.length });
            if (Pusher.isReady) {
                this.connect();
            }
        }
        Pusher.ready = function () {
            Pusher.isReady = true;
            for (var i = 0, l = Pusher.instances.length; i < l; i++) {
                Pusher.instances[i].connect();
            }
        };
        Pusher.log = function (message) {
            if (Pusher.logToConsole && window.console && window.console.log) {
                window.console.log(message);
            }
        };
        Pusher.getClientFeatures = function () {
            return keys(filterObject({ ws: runtime.Transports.ws }, function (t) {
                return t.isSupported({});
            }));
        };
        Pusher.prototype.channel = function (name) {
            return this.channels.find(name);
        };
        Pusher.prototype.allChannels = function () {
            return this.channels.all();
        };
        Pusher.prototype.connect = function () {
            this.connection.connect();
            if (this.timelineSender) {
                if (!this.timelineSenderTimer) {
                    var usingTLS = this.connection.isUsingTLS();
                    var timelineSender = this.timelineSender;
                    this.timelineSenderTimer = new PeriodicTimer(60000, function () {
                        timelineSender.send(usingTLS);
                    });
                }
            }
        };
        Pusher.prototype.disconnect = function () {
            this.connection.disconnect();
            if (this.timelineSenderTimer) {
                this.timelineSenderTimer.ensureAborted();
                this.timelineSenderTimer = null;
            }
        };
        Pusher.prototype.bind = function (event_name, callback, context) {
            this.global_emitter.bind(event_name, callback, context);
            return this;
        };
        Pusher.prototype.unbind = function (event_name, callback, context) {
            this.global_emitter.unbind(event_name, callback, context);
            return this;
        };
        Pusher.prototype.bind_global = function (callback) {
            this.global_emitter.bind_global(callback);
            return this;
        };
        Pusher.prototype.unbind_global = function (callback) {
            this.global_emitter.unbind_global(callback);
            return this;
        };
        Pusher.prototype.unbind_all = function (callback) {
            this.global_emitter.unbind_all();
            return this;
        };
        Pusher.prototype.subscribeAll = function () {
            var channelName;
            for (channelName in this.channels.channels) {
                if (this.channels.channels.hasOwnProperty(channelName)) {
                    this.subscribe(channelName);
                }
            }
        };
        Pusher.prototype.subscribe = function (channel_name) {
            var channel = this.channels.add(channel_name, this);
            if (channel.subscriptionPending && channel.subscriptionCancelled) {
                channel.reinstateSubscription();
            }
            else if (!channel.subscriptionPending &&
                this.connection.state === 'connected') {
                channel.subscribe();
            }
            return channel;
        };
        Pusher.prototype.unsubscribe = function (channel_name) {
            var channel = this.channels.find(channel_name);
            if (channel && channel.subscriptionPending) {
                channel.cancelSubscription();
            }
            else {
                channel = this.channels.remove(channel_name);
                if (channel && this.connection.state === 'connected') {
                    channel.unsubscribe();
                }
            }
        };
        Pusher.prototype.send_event = function (event_name, data, channel) {
            return this.connection.send_event(event_name, data, channel);
        };
        Pusher.prototype.shouldUseTLS = function () {
            if (runtime.getProtocol() === 'https:') {
                return true;
            }
            else if (this.config.forceTLS === true) {
                return true;
            }
            else {
                return Boolean(this.config.encrypted);
            }
        };
        Pusher.instances = [];
        Pusher.isReady = false;
        Pusher.logToConsole = false;
        Pusher.Runtime = runtime;
        Pusher.ScriptReceivers = runtime.ScriptReceivers;
        Pusher.DependenciesReceivers = runtime.DependenciesReceivers;
        Pusher.auth_callbacks = runtime.auth_callbacks;
        return Pusher;
    }());
    /* harmony default export */ var core_pusher = __webpack_exports__["default"] = (pusher_Pusher);
    function checkAppKey(key) {
        if (key === null || key === undefined) {
            throw 'You must pass your app key when you instantiate Pusher.';
        }
    }
    runtime.setup(pusher_Pusher);


    /***/ })
    /******/ ]);
    });
    });

    var Pusher = unwrapExports(pusher);

    /* client/Login.svelte generated by Svelte v3.14.1 */
    const file = "client/Login.svelte";

    function create_fragment(ctx) {
    	let div;
    	let form;
    	let label;
    	let t0;
    	let br;
    	let t1;
    	let t2;
    	let input0;
    	let t3;
    	let input1;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			form = element("form");
    			label = element("label");
    			t0 = text("Your initials ");
    			br = element("br");
    			t1 = text("(2 characters)");
    			t2 = space();
    			input0 = element("input");
    			t3 = space();
    			input1 = element("input");
    			add_location(br, file, 60, 23, 1067);
    			attr_dev(label, "class", "svelte-17nh6f");
    			add_location(label, file, 60, 2, 1046);
    			attr_dev(input0, "class", "input-text svelte-17nh6f");
    			input0.autofocus = true;
    			attr_dev(input0, "maxlength", "2");
    			attr_dev(input0, "size", "2");
    			add_location(input0, file, 61, 2, 1097);
    			attr_dev(input1, "class", "input-button svelte-17nh6f");
    			attr_dev(input1, "type", "submit");
    			input1.value = "go";
    			add_location(input1, file, 62, 2, 1181);
    			attr_dev(form, "id", "registrationForm");
    			attr_dev(form, "class", "svelte-17nh6f");
    			add_location(form, file, 58, 0, 978);
    			attr_dev(div, "class", "registration-form-container svelte-17nh6f");
    			add_location(div, file, 57, 0, 936);

    			dispose = [
    				listen_dev(input0, "input", ctx.input0_input_handler),
    				listen_dev(form, "submit", prevent_default(ctx.onSubmit), false, false, true)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, form);
    			append_dev(form, label);
    			append_dev(label, t0);
    			append_dev(label, br);
    			append_dev(label, t1);
    			append_dev(form, t2);
    			append_dev(form, input0);
    			set_input_value(input0, ctx.username);
    			append_dev(form, t3);
    			append_dev(form, input1);
    			input0.focus();
    		},
    		p: function update(changed, ctx) {
    			if (changed.username && input0.value !== ctx.username) {
    				set_input_value(input0, ctx.username);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { username } = $$props;

    	const onSubmit = evt => {
    		dispatch("submit", username);
    	};

    	const writable_props = ["username"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Login> was created with unknown prop '${key}'`);
    	});

    	function input0_input_handler() {
    		username = this.value;
    		$$invalidate("username", username);
    	}

    	$$self.$set = $$props => {
    		if ("username" in $$props) $$invalidate("username", username = $$props.username);
    	};

    	$$self.$capture_state = () => {
    		return { username };
    	};

    	$$self.$inject_state = $$props => {
    		if ("username" in $$props) $$invalidate("username", username = $$props.username);
    	};

    	return { username, onSubmit, input0_input_handler };
    }

    class Login extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { username: 0, onSubmit: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Login",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.username === undefined && !("username" in props)) {
    			console.warn("<Login> was created without expected prop 'username'");
    		}
    	}

    	get username() {
    		throw new Error("<Login>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set username(value) {
    		throw new Error("<Login>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onSubmit() {
    		return this.$$.ctx.onSubmit;
    	}

    	set onSubmit(value) {
    		throw new Error("<Login>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Controls.svelte generated by Svelte v3.14.1 */
    const file$1 = "client/Controls.svelte";

    function create_fragment$1(ctx) {
    	let div6;
    	let div5;
    	let div0;
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let div1;
    	let button2;
    	let t5;
    	let div2;
    	let button3;
    	let t7;
    	let button4;
    	let t9;
    	let div3;
    	let button5;
    	let t11;
    	let div4;
    	let dispose;

    	const block = {
    		c: function create() {
    			div6 = element("div");
    			div5 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			button0.textContent = "A";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "B";
    			t3 = space();
    			div1 = element("div");
    			button2 = element("button");
    			button2.textContent = "Up";
    			t5 = space();
    			div2 = element("div");
    			button3 = element("button");
    			button3.textContent = "left";
    			t7 = space();
    			button4 = element("button");
    			button4.textContent = "right";
    			t9 = space();
    			div3 = element("div");
    			button5 = element("button");
    			button5.textContent = "down";
    			t11 = space();
    			div4 = element("div");
    			div4.textContent = "(arrow keys and vi style `hjkl` also work)";
    			attr_dev(button0, "class", "svelte-p2zmx8");
    			add_location(button0, file$1, 139, 4, 2576);
    			attr_dev(button1, "class", "svelte-p2zmx8");
    			add_location(button1, file$1, 140, 4, 2681);
    			attr_dev(div0, "class", "button-row minor-buttons svelte-p2zmx8");
    			add_location(div0, file$1, 138, 2, 2533);
    			attr_dev(button2, "class", "svelte-p2zmx8");
    			add_location(button2, file$1, 143, 4, 2822);
    			attr_dev(div1, "class", "button-row svelte-p2zmx8");
    			add_location(div1, file$1, 142, 2, 2793);
    			attr_dev(button3, "class", "svelte-p2zmx8");
    			add_location(button3, file$1, 146, 4, 2964);
    			attr_dev(button4, "class", "svelte-p2zmx8");
    			add_location(button4, file$1, 147, 4, 3076);
    			attr_dev(div2, "class", "button-row svelte-p2zmx8");
    			add_location(div2, file$1, 145, 2, 2935);
    			attr_dev(button5, "class", "svelte-p2zmx8");
    			add_location(button5, file$1, 150, 4, 3227);
    			attr_dev(div3, "class", "button-row svelte-p2zmx8");
    			add_location(div3, file$1, 149, 2, 3198);
    			attr_dev(div4, "class", "button-row svelte-p2zmx8");
    			add_location(div4, file$1, 152, 0, 3344);
    			attr_dev(div5, "class", "controls svelte-p2zmx8");
    			add_location(div5, file$1, 137, 0, 2508);
    			attr_dev(div6, "class", "controls-container svelte-p2zmx8");
    			add_location(div6, file$1, 136, 0, 2475);

    			dispose = [
    				listen_dev(window, "keydown", ctx.onKeyDown, false, false, false),
    				listen_dev(window, "keyup", ctx.onKeyUp, false, false, false),
    				listen_dev(button0, "mousedown", ctx.hitA, false, false, false),
    				listen_dev(button0, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button0, "touchstart", ctx.hitA, { passive: true }, false, false),
    				listen_dev(button0, "touchend", ctx.goStop, { passive: true }, false, false),
    				listen_dev(button1, "mousedown", ctx.hitB, false, false, false),
    				listen_dev(button1, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button1, "touchstart", ctx.hitB, { passive: true }, false, false),
    				listen_dev(button1, "touchend", ctx.goStop, { passive: true }, false, false),
    				listen_dev(button2, "mousedown", ctx.goUp, false, false, false),
    				listen_dev(button2, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button2, "touchstart", ctx.goUp, { passive: true }, false, false),
    				listen_dev(button2, "touchend", ctx.goStop, { passive: true }, false, false),
    				listen_dev(button3, "mousedown", ctx.goLeft, false, false, false),
    				listen_dev(button3, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button3, "touchstart", ctx.goLeft, { passive: true }, false, false),
    				listen_dev(button3, "touchend", ctx.goStop, { passive: true }, false, false),
    				listen_dev(button4, "mousedown", ctx.goRight, false, false, false),
    				listen_dev(button4, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button4, "touchstart", ctx.goRight, { passive: true }, false, false),
    				listen_dev(button4, "touchend", ctx.goStop, { passive: true }, false, false),
    				listen_dev(button5, "mousedown", ctx.goDown, false, false, false),
    				listen_dev(button5, "mouseup", ctx.goStop, false, false, false),
    				listen_dev(button5, "touchstart", ctx.goDown, { passive: true }, false, false),
    				listen_dev(button5, "touchend", ctx.goStop, { passive: true }, false, false)
    			];
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div6, anchor);
    			append_dev(div6, div5);
    			append_dev(div5, div0);
    			append_dev(div0, button0);
    			append_dev(div0, t1);
    			append_dev(div0, button1);
    			append_dev(div5, t3);
    			append_dev(div5, div1);
    			append_dev(div1, button2);
    			append_dev(div5, t5);
    			append_dev(div5, div2);
    			append_dev(div2, button3);
    			append_dev(div2, t7);
    			append_dev(div2, button4);
    			append_dev(div5, t9);
    			append_dev(div5, div3);
    			append_dev(div3, button5);
    			append_dev(div5, t11);
    			append_dev(div5, div4);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div6);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { dir = { hForce: 0, vForce: 0 } } = $$props;
    	let { activeKeys = new Map() } = $$props;
    	let { sequence = "" } = $$props;

    	function goLeft() {
    		$$invalidate("sequence", sequence = `${sequence}h`);
    		$$invalidate("dir", dir = { vForce: 0, hForce: -1 });
    	}

    	function goRight() {
    		$$invalidate("sequence", sequence = `${sequence}l`);
    		$$invalidate("dir", dir = { vForce: 0, hForce: 1 });
    	}

    	function goUp() {
    		$$invalidate("sequence", sequence = `${sequence}k`);
    		$$invalidate("dir", dir = { hForce: 0, vForce: -1 });
    	}

    	function goDown() {
    		$$invalidate("sequence", sequence = `${sequence}j`);
    		$$invalidate("dir", dir = { hForce: 0, vForce: 1 });
    	}

    	function hitA() {
    		$$invalidate("sequence", sequence = `${sequence}a`);
    	}

    	function hitB() {
    		$$invalidate("sequence", sequence = `${sequence}b`);
    	}

    	function goStop() {
    		$$invalidate("dir", dir = { vForce: 0, hForce: 0 });
    	}

    	const onKeyDown = evt => {
    		if (activeKeys.get(evt.key)) {
    			return;
    		}

    		activeKeys.set(evt.key, true);

    		switch (evt.key) {
    			case "j":
    			case "ArrowDown":
    				goDown();
    				return;
    			case "k":
    			case "ArrowUp":
    				goUp();
    				return;
    			case "h":
    			case "ArrowLeft":
    				goLeft();
    				return;
    			case "l":
    			case "ArrowRight":
    				goRight();
    				return;
    			case "a":
    				hitA();
    				return;
    			case "b":
    				hitB();
    				return;
    			default:
    				return null;
    		}
    	};

    	const onKeyUp = evt => {
    		activeKeys.set(evt.key, false);

    		if (sequence.match("kkjjhlhlba")) {
    			dispatch("konami");
    			$$invalidate("sequence", sequence = "");
    		}

    		switch (evt.key) {
    			case "j":
    			case "ArrowDown":
    			case "k":
    			case "ArrowUp":
    			case "h":
    			case "ArrowLeft":
    			case "l":
    			case "ArrowRight":
    				goStop();
    				return;
    			default:
    				return null;
    		}
    	};

    	const writable_props = ["dir", "activeKeys", "sequence"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Controls> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("dir" in $$props) $$invalidate("dir", dir = $$props.dir);
    		if ("activeKeys" in $$props) $$invalidate("activeKeys", activeKeys = $$props.activeKeys);
    		if ("sequence" in $$props) $$invalidate("sequence", sequence = $$props.sequence);
    	};

    	$$self.$capture_state = () => {
    		return { dir, activeKeys, sequence };
    	};

    	$$self.$inject_state = $$props => {
    		if ("dir" in $$props) $$invalidate("dir", dir = $$props.dir);
    		if ("activeKeys" in $$props) $$invalidate("activeKeys", activeKeys = $$props.activeKeys);
    		if ("sequence" in $$props) $$invalidate("sequence", sequence = $$props.sequence);
    	};

    	$$self.$$.update = (changed = { dir: 1 }) => {
    		if (changed.dir) {
    			 dispatch("controls", dir);
    		}
    	};

    	return {
    		dir,
    		activeKeys,
    		sequence,
    		goLeft,
    		goRight,
    		goUp,
    		goDown,
    		hitA,
    		hitB,
    		goStop,
    		onKeyDown,
    		onKeyUp
    	};
    }

    class Controls extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { dir: 0, activeKeys: 0, sequence: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Controls",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get dir() {
    		throw new Error("<Controls>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dir(value) {
    		throw new Error("<Controls>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get activeKeys() {
    		throw new Error("<Controls>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set activeKeys(value) {
    		throw new Error("<Controls>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sequence() {
    		throw new Error("<Controls>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sequence(value) {
    		throw new Error("<Controls>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Player.svelte generated by Svelte v3.14.1 */

    const file$2 = "client/Player.svelte";

    function create_fragment$2(ctx) {
    	let svg;
    	let text_1;
    	let t_value = (ctx.player.konamiEnabled ? "😀" : ctx.player.info.name) + "";
    	let t;
    	let rect;
    	let rect_class_value;
    	let circle;
    	let svg_y_value;
    	let svg_x_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			text_1 = svg_element("text");
    			t = text(t_value);
    			rect = svg_element("rect");
    			circle = svg_element("circle");
    			attr_dev(text_1, "class", "player-name svelte-188ioou");
    			attr_dev(text_1, "x", "-10");
    			attr_dev(text_1, "y", "27");
    			add_location(text_1, file$2, 29, 2, 409);
    			attr_dev(rect, "class", rect_class_value = "player team-" + ctx.player.team + " svelte-188ioou");
    			attr_dev(rect, "width", "20");
    			attr_dev(rect, "height", "20");
    			attr_dev(rect, "rx", "5");
    			attr_dev(rect, "x", "-10");
    			attr_dev(rect, "y", "-10");
    			add_location(rect, file$2, 32, 4, 519);
    			attr_dev(circle, "r", "2");
    			attr_dev(circle, "fill", "yellow");
    			add_location(circle, file$2, 39, 4, 636);
    			attr_dev(svg, "y", svg_y_value = "" + (ctx.yPos + "%"));
    			attr_dev(svg, "x", svg_x_value = "" + (ctx.xPos + "%"));
    			attr_dev(svg, "overflow", "visible");
    			add_location(svg, file$2, 28, 0, 358);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, text_1);
    			append_dev(text_1, t);
    			append_dev(svg, rect);
    			append_dev(svg, circle);
    		},
    		p: function update(changed, ctx) {
    			if (changed.player && t_value !== (t_value = (ctx.player.konamiEnabled ? "😀" : ctx.player.info.name) + "")) set_data_dev(t, t_value);

    			if (changed.player && rect_class_value !== (rect_class_value = "player team-" + ctx.player.team + " svelte-188ioou")) {
    				attr_dev(rect, "class", rect_class_value);
    			}

    			if (changed.yPos && svg_y_value !== (svg_y_value = "" + (ctx.yPos + "%"))) {
    				attr_dev(svg, "y", svg_y_value);
    			}

    			if (changed.xPos && svg_x_value !== (svg_x_value = "" + (ctx.xPos + "%"))) {
    				attr_dev(svg, "x", svg_x_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { player } = $$props;
    	let { xPos = 0 } = $$props;
    	let { yPos = 0 } = $$props;
    	let { konami = true } = $$props;
    	const writable_props = ["player", "xPos", "yPos", "konami"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Player> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("player" in $$props) $$invalidate("player", player = $$props.player);
    		if ("xPos" in $$props) $$invalidate("xPos", xPos = $$props.xPos);
    		if ("yPos" in $$props) $$invalidate("yPos", yPos = $$props.yPos);
    		if ("konami" in $$props) $$invalidate("konami", konami = $$props.konami);
    	};

    	$$self.$capture_state = () => {
    		return { player, xPos, yPos, konami };
    	};

    	$$self.$inject_state = $$props => {
    		if ("player" in $$props) $$invalidate("player", player = $$props.player);
    		if ("xPos" in $$props) $$invalidate("xPos", xPos = $$props.xPos);
    		if ("yPos" in $$props) $$invalidate("yPos", yPos = $$props.yPos);
    		if ("konami" in $$props) $$invalidate("konami", konami = $$props.konami);
    	};

    	return { player, xPos, yPos, konami };
    }

    class Player extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { player: 0, xPos: 0, yPos: 0, konami: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Player",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || ({});

    		if (ctx.player === undefined && !("player" in props)) {
    			console.warn("<Player> was created without expected prop 'player'");
    		}
    	}

    	get player() {
    		throw new Error("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set player(value) {
    		throw new Error("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get xPos() {
    		throw new Error("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set xPos(value) {
    		throw new Error("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get yPos() {
    		throw new Error("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set yPos(value) {
    		throw new Error("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get konami() {
    		throw new Error("<Player>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set konami(value) {
    		throw new Error("<Player>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Ball.svelte generated by Svelte v3.14.1 */

    const file$3 = "client/Ball.svelte";

    function create_fragment$3(ctx) {
    	let svg;
    	let circle;
    	let svg_y_value;
    	let svg_x_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			circle = svg_element("circle");
    			attr_dev(circle, "r", "7");
    			attr_dev(circle, "cx", "-3.5");
    			attr_dev(circle, "cy", "-3.5");
    			attr_dev(circle, "fill", "yellow");
    			attr_dev(circle, "stroke", "black");
    			add_location(circle, file$3, 10, 2, 126);
    			attr_dev(svg, "y", svg_y_value = "" + (ctx.yPos + "%"));
    			attr_dev(svg, "x", svg_x_value = "" + (ctx.xPos + "%"));
    			attr_dev(svg, "overflow", "visible");
    			add_location(svg, file$3, 5, 0, 66);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, circle);
    		},
    		p: function update(changed, ctx) {
    			if (changed.yPos && svg_y_value !== (svg_y_value = "" + (ctx.yPos + "%"))) {
    				attr_dev(svg, "y", svg_y_value);
    			}

    			if (changed.xPos && svg_x_value !== (svg_x_value = "" + (ctx.xPos + "%"))) {
    				attr_dev(svg, "x", svg_x_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { xPos = 0 } = $$props;
    	let { yPos = 0 } = $$props;
    	const writable_props = ["xPos", "yPos"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Ball> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("xPos" in $$props) $$invalidate("xPos", xPos = $$props.xPos);
    		if ("yPos" in $$props) $$invalidate("yPos", yPos = $$props.yPos);
    	};

    	$$self.$capture_state = () => {
    		return { xPos, yPos };
    	};

    	$$self.$inject_state = $$props => {
    		if ("xPos" in $$props) $$invalidate("xPos", xPos = $$props.xPos);
    		if ("yPos" in $$props) $$invalidate("yPos", yPos = $$props.yPos);
    	};

    	return { xPos, yPos };
    }

    class Ball extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { xPos: 0, yPos: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Ball",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get xPos() {
    		throw new Error("<Ball>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set xPos(value) {
    		throw new Error("<Ball>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get yPos() {
    		throw new Error("<Ball>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set yPos(value) {
    		throw new Error("<Ball>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Goal.svelte generated by Svelte v3.14.1 */

    const file$4 = "client/Goal.svelte";

    function create_fragment$4(ctx) {
    	let svg;
    	let rect;
    	let rect_height_value;
    	let rect_x_value;
    	let svg_x_value;
    	let svg_y_value;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			rect = svg_element("rect");
    			attr_dev(rect, "stroke-width", "2");
    			attr_dev(rect, "stroke", "#fff");
    			attr_dev(rect, "fill", "none");
    			attr_dev(rect, "stroke-dasharray", "4");
    			attr_dev(rect, "opacity", "1");
    			attr_dev(rect, "width", "10");
    			attr_dev(rect, "height", rect_height_value = "" + (ctx.size + "%"));
    			attr_dev(rect, "x", rect_x_value = ctx.side === "left" ? 0 : -10);
    			add_location(rect, file$4, 14, 2, 211);
    			attr_dev(svg, "x", svg_x_value = "" + ((ctx.side === "left" ? 0 : 100) + "%"));
    			attr_dev(svg, "y", svg_y_value = "" + (ctx.goalPosts.top + "%"));
    			attr_dev(svg, "overflow", "visible");
    			add_location(svg, file$4, 10, 0, 132);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, rect);
    		},
    		p: function update(changed, ctx) {
    			if (changed.size && rect_height_value !== (rect_height_value = "" + (ctx.size + "%"))) {
    				attr_dev(rect, "height", rect_height_value);
    			}

    			if (changed.side && rect_x_value !== (rect_x_value = ctx.side === "left" ? 0 : -10)) {
    				attr_dev(rect, "x", rect_x_value);
    			}

    			if (changed.side && svg_x_value !== (svg_x_value = "" + ((ctx.side === "left" ? 0 : 100) + "%"))) {
    				attr_dev(svg, "x", svg_x_value);
    			}

    			if (changed.goalPosts && svg_y_value !== (svg_y_value = "" + (ctx.goalPosts.top + "%"))) {
    				attr_dev(svg, "y", svg_y_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { side = "left" } = $$props;
    	let { size = 80 } = $$props;
    	let { goalPosts = { top: 10, bottom: 10 } } = $$props;
    	const writable_props = ["side", "size", "goalPosts"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Goal> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("side" in $$props) $$invalidate("side", side = $$props.side);
    		if ("size" in $$props) $$invalidate("size", size = $$props.size);
    		if ("goalPosts" in $$props) $$invalidate("goalPosts", goalPosts = $$props.goalPosts);
    	};

    	$$self.$capture_state = () => {
    		return { side, size, goalPosts };
    	};

    	$$self.$inject_state = $$props => {
    		if ("side" in $$props) $$invalidate("side", side = $$props.side);
    		if ("size" in $$props) $$invalidate("size", size = $$props.size);
    		if ("goalPosts" in $$props) $$invalidate("goalPosts", goalPosts = $$props.goalPosts);
    	};

    	return { side, size, goalPosts };
    }

    class Goal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { side: 0, size: 0, goalPosts: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Goal",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get side() {
    		throw new Error("<Goal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set side(value) {
    		throw new Error("<Goal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get size() {
    		throw new Error("<Goal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set size(value) {
    		throw new Error("<Goal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get goalPosts() {
    		throw new Error("<Goal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set goalPosts(value) {
    		throw new Error("<Goal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Arena.svelte generated by Svelte v3.14.1 */

    const { Object: Object_1 } = globals;
    const file$5 = "client/Arena.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = Object_1.create(ctx);
    	child_ctx.player = list[i];
    	return child_ctx;
    }

    // (175:4) {#each renderedPlayers as player}
    function create_each_block(ctx) {
    	let current;

    	const player = new Player({
    			props: {
    				player: ctx.player,
    				xPos: ctx.player.xPos,
    				yPos: ctx.player.yPos,
    				konami: ctx.player.konamiEnabled
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(player.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(player, target, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const player_changes = {};
    			if (changed.renderedPlayers) player_changes.player = ctx.player;
    			if (changed.renderedPlayers) player_changes.xPos = ctx.player.xPos;
    			if (changed.renderedPlayers) player_changes.yPos = ctx.player.yPos;
    			if (changed.renderedPlayers) player_changes.konami = ctx.player.konamiEnabled;
    			player.$set(player_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(player.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(player.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(player, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(175:4) {#each renderedPlayers as player}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let main;
    	let svg0;
    	let g;
    	let circle0;
    	let circle1;
    	let line;
    	let t;
    	let svg1;
    	let current;

    	const goal0 = new Goal({
    			props: {
    				side: "left",
    				goalPosts: ctx.goalPosts,
    				size: ctx.goalSize
    			},
    			$$inline: true
    		});

    	const goal1 = new Goal({
    			props: {
    				side: "right",
    				goalPosts: ctx.goalPosts,
    				size: ctx.goalSize
    			},
    			$$inline: true
    		});

    	const ball_spread_levels = [ctx.ballPos];
    	let ball_props = {};

    	for (let i = 0; i < ball_spread_levels.length; i += 1) {
    		ball_props = assign(ball_props, ball_spread_levels[i]);
    	}

    	const ball = new Ball({ props: ball_props, $$inline: true });
    	let each_value = ctx.renderedPlayers;
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			main = element("main");
    			svg0 = svg_element("svg");
    			g = svg_element("g");
    			circle0 = svg_element("circle");
    			circle1 = svg_element("circle");
    			line = svg_element("line");
    			t = space();
    			svg1 = svg_element("svg");
    			create_component(goal0.$$.fragment);
    			create_component(goal1.$$.fragment);
    			create_component(ball.$$.fragment);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(circle0, "cx", "50%");
    			attr_dev(circle0, "cy", "50%");
    			attr_dev(circle0, "r", "20%");
    			add_location(circle0, file$5, 164, 6, 3942);
    			attr_dev(circle1, "cx", "50%");
    			attr_dev(circle1, "cy", "50%");
    			attr_dev(circle1, "r", "5");
    			add_location(circle1, file$5, 165, 6, 3985);
    			attr_dev(line, "x1", "50%");
    			attr_dev(line, "x2", "50%");
    			attr_dev(line, "y1", "0");
    			attr_dev(line, "y2", "100%");
    			add_location(line, file$5, 166, 6, 4026);
    			attr_dev(g, "class", "line svelte-18svfbx");
    			add_location(g, file$5, 163, 4, 3919);
    			attr_dev(svg0, "class", "linemarkings svelte-18svfbx");
    			add_location(svg0, file$5, 162, 2, 3888);
    			attr_dev(svg1, "class", "svgcanvas svelte-18svfbx");
    			add_location(svg1, file$5, 170, 2, 4091);
    			attr_dev(main, "class", "playingfield svelte-18svfbx");
    			add_location(main, file$5, 161, 0, 3858);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			append_dev(main, svg0);
    			append_dev(svg0, g);
    			append_dev(g, circle0);
    			append_dev(g, circle1);
    			append_dev(g, line);
    			append_dev(main, t);
    			append_dev(main, svg1);
    			mount_component(goal0, svg1, null);
    			mount_component(goal1, svg1, null);
    			mount_component(ball, svg1, null);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(svg1, null);
    			}

    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const goal0_changes = {};
    			if (changed.goalPosts) goal0_changes.goalPosts = ctx.goalPosts;
    			if (changed.goalSize) goal0_changes.size = ctx.goalSize;
    			goal0.$set(goal0_changes);
    			const goal1_changes = {};
    			if (changed.goalPosts) goal1_changes.goalPosts = ctx.goalPosts;
    			if (changed.goalSize) goal1_changes.size = ctx.goalSize;
    			goal1.$set(goal1_changes);

    			const ball_changes = changed.ballPos
    			? get_spread_update(ball_spread_levels, [get_spread_object(ctx.ballPos)])
    			: {};

    			ball.$set(ball_changes);

    			if (changed.renderedPlayers) {
    				each_value = ctx.renderedPlayers;
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(changed, child_ctx);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(svg1, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(goal0.$$.fragment, local);
    			transition_in(goal1.$$.fragment, local);
    			transition_in(ball.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(goal0.$$.fragment, local);
    			transition_out(goal1.$$.fragment, local);
    			transition_out(ball.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(goal0);
    			destroy_component(goal1);
    			destroy_component(ball);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { playerPositions = {} } = $$props;
    	let { renderedPlayers = [] } = $$props;
    	let { currentPlayers = [] } = $$props;

    	let { ballPos = {
    		xPos: 50,
    		yPos: 50,
    		speed: 0,
    		hForce: 1,
    		vForce: 1
    	} } = $$props;

    	const dispatch = createEventDispatcher();
    	let { playerFriction = 0.05 } = $$props;
    	let { ballFriction = 0.08 } = $$props;
    	let { arenaSize = { width: 100, height: 100 } } = $$props;
    	let { goalSize = 30 } = $$props;
    	let { collisionProximity = 2.8 } = $$props;
    	let { kickVariation = 2 } = $$props;
    	let containerWidth;
    	let containerHeight;

    	const animStep = () => {
    		Object.entries(playerPositions).forEach(([key, p]) => {
    			if (p.speed > playerFriction / 2) {
    				p.speed -= playerFriction;
    			} else {
    				p.speed = 0;
    			}

    			if (ballPos.speed > ballFriction / 2) {
    				$$invalidate("ballPos", ballPos.speed -= ballFriction, ballPos);
    			} else {
    				$$invalidate("ballPos", ballPos.speed = 0, ballPos);
    			}

    			const newxPos = p.xPos + p.hForce * p.speed;

    			if (0 < newxPos && arenaSize.width > newxPos) {
    				p.xPos = newxPos;
    			}

    			const newyPos = p.yPos + p.vForce * p.speed;

    			if (0 < newyPos && arenaSize.height > newyPos) {
    				p.yPos = newyPos;
    			}

    			if (Math.abs(ballPos.xPos - p.xPos) <= collisionProximity && Math.abs(ballPos.yPos - p.yPos) <= collisionProximity) {
    				$$invalidate("ballPos", ballPos.speed = p.speed * 2, ballPos);

    				if (p.xPos > ballPos.xPos) {
    					$$invalidate("ballPos", ballPos.hForce = -1 * (Math.random() * kickVariation), ballPos);
    					$$invalidate("ballPos", ballPos.xPos -= collisionProximity, ballPos);
    				} else {
    					$$invalidate("ballPos", ballPos.hForce = Math.random() * kickVariation, ballPos);
    					$$invalidate("ballPos", ballPos.xPos += collisionProximity, ballPos);
    				}

    				if (p.yPos > ballPos.yPos) {
    					$$invalidate("ballPos", ballPos.yPos -= collisionProximity, ballPos);
    					$$invalidate("ballPos", ballPos.vForce = -1 * (Math.random() * kickVariation), ballPos);
    				} else {
    					$$invalidate("ballPos", ballPos.yPos += collisionProximity, ballPos);
    					$$invalidate("ballPos", ballPos.vForce = Math.random() * kickVariation, ballPos);
    				}

    				dispatch("ballcollide", ballPos);
    			}
    		});

    		$$invalidate("renderedPlayers", renderedPlayers = currentPlayers.map(m => ({ ...m, ...playerPositions[m.id] })));

    		if (ballPos.xPos > arenaSize.width) {
    			if (arenaSize.height / 2 - goalSize / 2 < ballPos.yPos && arenaSize.height / 2 + goalSize / 2 > ballPos.yPos) {
    				dispatch("goooooal", "right");
    			} else {
    				$$invalidate("ballPos", ballPos.xPos = arenaSize.width - 1, ballPos);
    				$$invalidate("ballPos", ballPos.hForce = -1, ballPos);
    			}
    		}

    		if (ballPos.xPos < 0) {
    			if (arenaSize.height / 2 - goalSize / 2 < ballPos.yPos && arenaSize.height / 2 + goalSize / 2 > ballPos.yPos) {
    				dispatch("goooooal", "left");
    			} else {
    				$$invalidate("ballPos", ballPos.xPos = 1, ballPos);
    				$$invalidate("ballPos", ballPos.hForce = 1, ballPos);
    			}
    		}

    		if (ballPos.yPos > arenaSize.height) {
    			$$invalidate("ballPos", ballPos.yPos = arenaSize.height - 1, ballPos);
    			$$invalidate("ballPos", ballPos.vForce = -1, ballPos);
    		}

    		if (ballPos.yPos < 0) {
    			$$invalidate("ballPos", ballPos.yPos = 1, ballPos);
    			$$invalidate("ballPos", ballPos.vForce = 1, ballPos);
    		}

    		$$invalidate("ballPos", ballPos = {
    			...ballPos,
    			xPos: ballPos.xPos + ballPos.hForce * ballPos.speed,
    			yPos: ballPos.yPos + ballPos.vForce * ballPos.speed
    		});

    		window.requestAnimationFrame(animStep);
    	};

    	animStep();

    	const writable_props = [
    		"playerPositions",
    		"renderedPlayers",
    		"currentPlayers",
    		"ballPos",
    		"playerFriction",
    		"ballFriction",
    		"arenaSize",
    		"goalSize",
    		"collisionProximity",
    		"kickVariation"
    	];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Arena> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("playerPositions" in $$props) $$invalidate("playerPositions", playerPositions = $$props.playerPositions);
    		if ("renderedPlayers" in $$props) $$invalidate("renderedPlayers", renderedPlayers = $$props.renderedPlayers);
    		if ("currentPlayers" in $$props) $$invalidate("currentPlayers", currentPlayers = $$props.currentPlayers);
    		if ("ballPos" in $$props) $$invalidate("ballPos", ballPos = $$props.ballPos);
    		if ("playerFriction" in $$props) $$invalidate("playerFriction", playerFriction = $$props.playerFriction);
    		if ("ballFriction" in $$props) $$invalidate("ballFriction", ballFriction = $$props.ballFriction);
    		if ("arenaSize" in $$props) $$invalidate("arenaSize", arenaSize = $$props.arenaSize);
    		if ("goalSize" in $$props) $$invalidate("goalSize", goalSize = $$props.goalSize);
    		if ("collisionProximity" in $$props) $$invalidate("collisionProximity", collisionProximity = $$props.collisionProximity);
    		if ("kickVariation" in $$props) $$invalidate("kickVariation", kickVariation = $$props.kickVariation);
    	};

    	$$self.$capture_state = () => {
    		return {
    			playerPositions,
    			renderedPlayers,
    			currentPlayers,
    			ballPos,
    			playerFriction,
    			ballFriction,
    			arenaSize,
    			goalSize,
    			collisionProximity,
    			kickVariation,
    			containerWidth,
    			containerHeight,
    			goalPosts
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("playerPositions" in $$props) $$invalidate("playerPositions", playerPositions = $$props.playerPositions);
    		if ("renderedPlayers" in $$props) $$invalidate("renderedPlayers", renderedPlayers = $$props.renderedPlayers);
    		if ("currentPlayers" in $$props) $$invalidate("currentPlayers", currentPlayers = $$props.currentPlayers);
    		if ("ballPos" in $$props) $$invalidate("ballPos", ballPos = $$props.ballPos);
    		if ("playerFriction" in $$props) $$invalidate("playerFriction", playerFriction = $$props.playerFriction);
    		if ("ballFriction" in $$props) $$invalidate("ballFriction", ballFriction = $$props.ballFriction);
    		if ("arenaSize" in $$props) $$invalidate("arenaSize", arenaSize = $$props.arenaSize);
    		if ("goalSize" in $$props) $$invalidate("goalSize", goalSize = $$props.goalSize);
    		if ("collisionProximity" in $$props) $$invalidate("collisionProximity", collisionProximity = $$props.collisionProximity);
    		if ("kickVariation" in $$props) $$invalidate("kickVariation", kickVariation = $$props.kickVariation);
    		if ("containerWidth" in $$props) containerWidth = $$props.containerWidth;
    		if ("containerHeight" in $$props) containerHeight = $$props.containerHeight;
    		if ("goalPosts" in $$props) $$invalidate("goalPosts", goalPosts = $$props.goalPosts);
    	};

    	let goalPosts;

    	$$self.$$.update = (changed = { arenaSize: 1, goalSize: 1 }) => {
    		if (changed.arenaSize || changed.goalSize) {
    			 $$invalidate("goalPosts", goalPosts = {
    				top: arenaSize.height / 2 - goalSize / 2,
    				bottom: arenaSize.height / 2 + goalSize / 2
    			});
    		}
    	};

    	return {
    		playerPositions,
    		renderedPlayers,
    		currentPlayers,
    		ballPos,
    		playerFriction,
    		ballFriction,
    		arenaSize,
    		goalSize,
    		collisionProximity,
    		kickVariation,
    		goalPosts
    	};
    }

    class Arena extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			playerPositions: 0,
    			renderedPlayers: 0,
    			currentPlayers: 0,
    			ballPos: 0,
    			playerFriction: 0,
    			ballFriction: 0,
    			arenaSize: 0,
    			goalSize: 0,
    			collisionProximity: 0,
    			kickVariation: 0
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Arena",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get playerPositions() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set playerPositions(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get renderedPlayers() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set renderedPlayers(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get currentPlayers() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set currentPlayers(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ballPos() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ballPos(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get playerFriction() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set playerFriction(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get ballFriction() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set ballFriction(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get arenaSize() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set arenaSize(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get goalSize() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set goalSize(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get collisionProximity() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set collisionProximity(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get kickVariation() {
    		throw new Error("<Arena>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set kickVariation(value) {
    		throw new Error("<Arena>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/Score.svelte generated by Svelte v3.14.1 */

    const file$6 = "client/Score.svelte";

    function create_fragment$6(ctx) {
    	let div4;
    	let div0;
    	let t0;
    	let div1;
    	let t1_value = ctx.scoreline[1] + "";
    	let t1;
    	let t2;
    	let div2;
    	let t3_value = ctx.scoreline[0] + "";
    	let t3;
    	let t4;
    	let div3;

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			div0 = element("div");
    			t0 = space();
    			div1 = element("div");
    			t1 = text(t1_value);
    			t2 = space();
    			div2 = element("div");
    			t3 = text(t3_value);
    			t4 = space();
    			div3 = element("div");
    			attr_dev(div0, "class", "team team-1 svelte-1w98fn7");
    			add_location(div0, file$6, 38, 4, 466);
    			attr_dev(div1, "class", "score svelte-1w98fn7");
    			add_location(div1, file$6, 39, 4, 502);
    			attr_dev(div2, "class", "score svelte-1w98fn7");
    			add_location(div2, file$6, 40, 4, 546);
    			attr_dev(div3, "class", "team team-0 svelte-1w98fn7");
    			add_location(div3, file$6, 41, 4, 590);
    			attr_dev(div4, "class", "scoreboard svelte-1w98fn7");
    			add_location(div4, file$6, 37, 0, 437);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, div0);
    			append_dev(div4, t0);
    			append_dev(div4, div1);
    			append_dev(div1, t1);
    			append_dev(div4, t2);
    			append_dev(div4, div2);
    			append_dev(div2, t3);
    			append_dev(div4, t4);
    			append_dev(div4, div3);
    		},
    		p: function update(changed, ctx) {
    			if (changed.scoreline && t1_value !== (t1_value = ctx.scoreline[1] + "")) set_data_dev(t1, t1_value);
    			if (changed.scoreline && t3_value !== (t3_value = ctx.scoreline[0] + "")) set_data_dev(t3, t3_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { scoreline = [0, 0] } = $$props;
    	const writable_props = ["scoreline"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Score> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("scoreline" in $$props) $$invalidate("scoreline", scoreline = $$props.scoreline);
    	};

    	$$self.$capture_state = () => {
    		return { scoreline };
    	};

    	$$self.$inject_state = $$props => {
    		if ("scoreline" in $$props) $$invalidate("scoreline", scoreline = $$props.scoreline);
    	};

    	return { scoreline };
    }

    class Score extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, { scoreline: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Score",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get scoreline() {
    		throw new Error("<Score>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scoreline(value) {
    		throw new Error("<Score>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }

    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }

    /* client/ReceivedMessages.svelte generated by Svelte v3.14.1 */
    const file$7 = "client/ReceivedMessages.svelte";

    // (60:4) {#if displayMessageText}
    function create_if_block(ctx) {
    	let div;
    	let t;
    	let div_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(ctx.currentMessageText);
    			attr_dev(div, "class", "message svelte-1nlmv3r");
    			set_style(div, "left", ctx.messagePosition + "px");
    			add_location(div, file$7, 60, 4, 1183);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (!current || changed.currentMessageText) set_data_dev(t, ctx.currentMessageText);

    			if (!current || changed.messagePosition) {
    				set_style(div, "left", ctx.messagePosition + "px");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, slide, {}, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(60:4) {#if displayMessageText}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let div;
    	let current;
    	let if_block = ctx.displayMessageText && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div, "class", "received-messages svelte-1nlmv3r");
    			add_location(div, file$7, 58, 0, 1118);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			if (ctx.displayMessageText) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let { messages = [] } = $$props;
    	let currentMessageIndex = 0;
    	let currentMessageText = "";
    	let displayMessageText = false;
    	let messagePosition = 100;

    	function switchMessages() {
    		if (!messages.length) {
    			return;
    		}

    		$$invalidate("displayMessageText", displayMessageText = false);

    		setTimeout(
    			() => {
    				currentMessageIndex += 1;
    				$$invalidate("currentMessageText", currentMessageText = messages[currentMessageIndex % messages.length].tweet);
    				$$invalidate("displayMessageText", displayMessageText = true);
    				$$invalidate("messagePosition", messagePosition = 100);
    			},
    			1000
    		);
    	}

    	let messageTimer = setInterval(switchMessages, 10000);

    	function scrollMessage() {
    		$$invalidate("messagePosition", messagePosition -= 1);
    		window.requestAnimationFrame(scrollMessage);
    	}

    	scrollMessage();
    	const writable_props = ["messages"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ReceivedMessages> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("messages" in $$props) $$invalidate("messages", messages = $$props.messages);
    	};

    	$$self.$capture_state = () => {
    		return {
    			messages,
    			currentMessageIndex,
    			currentMessageText,
    			displayMessageText,
    			messagePosition,
    			messageTimer
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("messages" in $$props) $$invalidate("messages", messages = $$props.messages);
    		if ("currentMessageIndex" in $$props) currentMessageIndex = $$props.currentMessageIndex;
    		if ("currentMessageText" in $$props) $$invalidate("currentMessageText", currentMessageText = $$props.currentMessageText);
    		if ("displayMessageText" in $$props) $$invalidate("displayMessageText", displayMessageText = $$props.displayMessageText);
    		if ("messagePosition" in $$props) $$invalidate("messagePosition", messagePosition = $$props.messagePosition);
    		if ("messageTimer" in $$props) messageTimer = $$props.messageTimer;
    	};

    	return {
    		messages,
    		currentMessageText,
    		displayMessageText,
    		messagePosition
    	};
    }

    class ReceivedMessages extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, { messages: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ReceivedMessages",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get messages() {
    		throw new Error("<ReceivedMessages>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set messages(value) {
    		throw new Error("<ReceivedMessages>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* client/App.svelte generated by Svelte v3.14.1 */

    const { console: console_1 } = globals;
    const file$8 = "client/App.svelte";

    // (219:0) {:else}
    function create_else_block(ctx) {
    	let div5;
    	let div0;
    	let t0;
    	let div1;
    	let t1;
    	let div2;
    	let t2;
    	let div4;
    	let t3;
    	let div3;
    	let current;

    	const receivedmessages = new ReceivedMessages({
    			props: { messages: ctx.receivedMessages },
    			$$inline: true
    		});

    	const score = new Score({
    			props: { scoreline: ctx.scoreline },
    			$$inline: true
    		});

    	const arena = new Arena({
    			props: {
    				playerPositions: ctx.playerPositions,
    				currentPlayers: ctx.currentPlayers,
    				ballPos: ctx.ballPos
    			},
    			$$inline: true
    		});

    	arena.$on("ballcollide", ctx.onBallCollide);
    	arena.$on("goooooal", ctx.onGoal);
    	const controls = new Controls({ $$inline: true });
    	controls.$on("controls", ctx.onPlayerControl);
    	controls.$on("konami", ctx.onKonami);
    	let if_block = ctx.me && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			div5 = element("div");
    			div0 = element("div");
    			create_component(receivedmessages.$$.fragment);
    			t0 = space();
    			div1 = element("div");
    			create_component(score.$$.fragment);
    			t1 = space();
    			div2 = element("div");
    			create_component(arena.$$.fragment);
    			t2 = space();
    			div4 = element("div");
    			create_component(controls.$$.fragment);
    			t3 = space();
    			div3 = element("div");
    			if (if_block) if_block.c();
    			attr_dev(div0, "class", "messagesbanner svelte-tjbafg");
    			add_location(div0, file$8, 221, 4, 5079);
    			attr_dev(div1, "class", "scoreboard svelte-tjbafg");
    			add_location(div1, file$8, 224, 4, 5179);
    			attr_dev(div2, "class", "arena svelte-tjbafg");
    			add_location(div2, file$8, 228, 4, 5248);
    			attr_dev(div3, "class", "greeting");
    			add_location(div3, file$8, 239, 6, 5536);
    			attr_dev(div4, "class", "controls svelte-tjbafg");
    			add_location(div4, file$8, 237, 4, 5437);
    			attr_dev(div5, "class", "gamearea svelte-tjbafg");
    			add_location(div5, file$8, 220, 2, 5052);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div5, anchor);
    			append_dev(div5, div0);
    			mount_component(receivedmessages, div0, null);
    			append_dev(div5, t0);
    			append_dev(div5, div1);
    			mount_component(score, div1, null);
    			append_dev(div5, t1);
    			append_dev(div5, div2);
    			mount_component(arena, div2, null);
    			append_dev(div5, t2);
    			append_dev(div5, div4);
    			mount_component(controls, div4, null);
    			append_dev(div4, t3);
    			append_dev(div4, div3);
    			if (if_block) if_block.m(div3, null);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			const receivedmessages_changes = {};
    			if (changed.receivedMessages) receivedmessages_changes.messages = ctx.receivedMessages;
    			receivedmessages.$set(receivedmessages_changes);
    			const score_changes = {};
    			if (changed.scoreline) score_changes.scoreline = ctx.scoreline;
    			score.$set(score_changes);
    			const arena_changes = {};
    			if (changed.playerPositions) arena_changes.playerPositions = ctx.playerPositions;
    			if (changed.currentPlayers) arena_changes.currentPlayers = ctx.currentPlayers;
    			if (changed.ballPos) arena_changes.ballPos = ctx.ballPos;
    			arena.$set(arena_changes);

    			if (ctx.me) {
    				if (if_block) {
    					if_block.p(changed, ctx);
    				} else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(div3, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(receivedmessages.$$.fragment, local);
    			transition_in(score.$$.fragment, local);
    			transition_in(arena.$$.fragment, local);
    			transition_in(controls.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(receivedmessages.$$.fragment, local);
    			transition_out(score.$$.fragment, local);
    			transition_out(arena.$$.fragment, local);
    			transition_out(controls.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div5);
    			destroy_component(receivedmessages);
    			destroy_component(score);
    			destroy_component(arena);
    			destroy_component(controls);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(219:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (216:0) {#if !usertoken}
    function create_if_block$1(ctx) {
    	let current;
    	const login = new Login({ $$inline: true });
    	login.$on("submit", ctx.onSubmit);

    	const block = {
    		c: function create() {
    			create_component(login.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(login, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(login.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(login.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(login, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(216:0) {#if !usertoken}",
    		ctx
    	});

    	return block;
    }

    // (241:8) {#if me}
    function create_if_block_1(ctx) {
    	let t0;
    	let t1_value = ctx.me.info.name + "";
    	let t1;
    	let t2;

    	const block = {
    		c: function create() {
    			t0 = text("Hello ");
    			t1 = text(t1_value);
    			t2 = text("!");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, t2, anchor);
    		},
    		p: function update(changed, ctx) {
    			if (changed.me && t1_value !== (t1_value = ctx.me.info.name + "")) set_data_dev(t1, t1_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(t2);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(241:8) {#if me}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$8(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block$1, create_else_block];
    	const if_blocks = [];

    	function select_block_type(changed, ctx) {
    		if (!ctx.usertoken) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(null, ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(changed, ctx) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(changed, ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(changed, ctx);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    let playerSpeed = 1;

    function instance$8($$self, $$props, $$invalidate) {
    	let { pusher = null } = $$props;
    	let { usertoken = null } = $$props;
    	let { pusherChannel = null } = $$props;
    	let { messagesChannel = null } = $$props;
    	let { isGameHost = false } = $$props;
    	let receivedMessages = [];
    	let currentPlayers = [];
    	let me = null;
    	let playerPositions = {};

    	let playerDefaultStartPos = {
    		xPos: 0,
    		yPos: 0,
    		vForce: 0,
    		hForce: 0,
    		speed: 3
    	};

    	let startBallPos = {
    		xPos: 50,
    		yPos: 50,
    		speed: 0,
    		hForce: 1,
    		vForce: 1
    	};

    	let ballPos = { ...startBallPos };
    	let scoreline = [0, 0];
    	let arenaSize = { width: 100, height: 100 };
    	let konamiEnabled = false;

    	const setCurrentMembers = pusherMembers => {
    		const members = [];

    		if (!pusherMembers) {
    			return members;
    		}

    		pusherMembers.each(m => {
    			members.push(m);
    		});

    		$$invalidate("isGameHost", isGameHost = pusherChannel.members.me.id === members[0].id);
    		return members;
    	};

    	const pusherInit = () => {
    		$$invalidate("pusher", pusher = new Pusher("5682fcdf7df3eb814416",
    		{
    				cluster: "eu",
    				forceTLS: false,
    				auth: {
    					headers: { authorization: `Bearer ${usertoken}` }
    				}
    			}));

    		$$invalidate("pusherChannel", pusherChannel = pusher.subscribe("presence-lnug-channel"));
    		$$invalidate("messagesChannel", messagesChannel = pusher.subscribe("lnug-game-cheers"));

    		pusherChannel.bind("pusher:subscription_succeeded", function (members) {
    			$$invalidate("currentPlayers", currentPlayers = setCurrentMembers(pusherChannel.members));
    			$$invalidate("me", me = pusherChannel.members.me);
    			const team = currentPlayers.length % 2;

    			updatePlayerPositions(me.id, {
    				...playerDefaultStartPos,
    				team,
    				xPos: team ? arenaSize.width - 10 : 10,
    				yPos: Math.random() * arenaSize.height
    			});
    		});

    		pusherChannel.bind("pusher:member_added", function (member) {
    			$$invalidate("currentPlayers", currentPlayers = setCurrentMembers(pusherChannel.members));
    			pusherChannel.trigger("client-player-move", playerPositions[me.id]);

    			if (isGameHost) {
    				pusherChannel.trigger("client-init", { scoreline });
    			}
    		});

    		pusherChannel.bind("pusher:member_removed", function (member) {
    			$$invalidate("currentPlayers", currentPlayers = setCurrentMembers(pusherChannel.members));
    		});

    		pusherChannel.bind("client-player-move", function (data, meta) {
    			updatePlayerPositions(meta.user_id, data);
    		});

    		pusherChannel.bind("client-ball-bounce", function (data, meta) {
    			updateBallPosition(data);
    		});

    		pusherChannel.bind("client-init", function ({ scoreline }, meta) {
    			updateScoreline(scoreline);
    		});

    		pusherChannel.bind("client-goal", function (data, meta) {
    			updateScoreline(data);
    			updateBallPosition(startBallPos);
    		});

    		messagesChannel.bind("twitter-hoorah", function (data) {
    			$$invalidate("receivedMessages", receivedMessages = [...receivedMessages, data]);
    		});
    	};

    	const onSubmit = async evt => {
    		const response = await fetch("/register", {
    			method: "POST",
    			headers: { "Content-Type": "application/json" },
    			body: JSON.stringify({ username: evt.detail })
    		});

    		const data = await response.json();
    		$$invalidate("usertoken", usertoken = data.token);

    		if (usertoken) {
    			pusherInit();
    		}
    	};

    	const updatePlayerPositions = (id, position) => {
    		$$invalidate("playerPositions", playerPositions = { ...playerPositions, [id]: position });
    	};

    	const updateBallPosition = newBallPos => {
    		$$invalidate("ballPos", ballPos = { ...startBallPos, ...newBallPos });
    	};

    	const updateScoreline = newScoreline => {
    		$$invalidate("scoreline", scoreline = newScoreline);
    	};

    	const onPlayerControl = evt => {
    		const position = {
    			...playerDefaultStartPos,
    			...playerPositions[me.id],
    			...evt.detail,
    			speed: playerSpeed,
    			konamiEnabled
    		};

    		updatePlayerPositions(me.id, position);
    		pusherChannel.trigger("client-player-move", position);
    	};

    	const onGoal = evt => {
    		const newScoreline = [...scoreline];

    		if (evt.detail === "left") {
    			newScoreline[0] += 1;
    		} else {
    			newScoreline[1] += 1;
    		}

    		if (isGameHost) {
    			$$invalidate("ballPos", ballPos = startBallPos);
    			updateScoreline(newScoreline);
    			pusherChannel.trigger("client-goal", newScoreline);
    		}
    	};

    	const onBallCollide = evt => {
    		if (isGameHost) {
    			updateBallPosition(evt.detail);
    			pusherChannel.trigger("client-ball-bounce", evt.detail);
    		}
    	};

    	const onKonami = evt => {
    		konamiEnabled = true;
    		console.log("KONAMI!!!");
    		setTimeout(() => konamiEnabled = false, 20000);
    	};

    	const writable_props = ["pusher", "usertoken", "pusherChannel", "messagesChannel", "isGameHost"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$set = $$props => {
    		if ("pusher" in $$props) $$invalidate("pusher", pusher = $$props.pusher);
    		if ("usertoken" in $$props) $$invalidate("usertoken", usertoken = $$props.usertoken);
    		if ("pusherChannel" in $$props) $$invalidate("pusherChannel", pusherChannel = $$props.pusherChannel);
    		if ("messagesChannel" in $$props) $$invalidate("messagesChannel", messagesChannel = $$props.messagesChannel);
    		if ("isGameHost" in $$props) $$invalidate("isGameHost", isGameHost = $$props.isGameHost);
    	};

    	$$self.$capture_state = () => {
    		return {
    			pusher,
    			usertoken,
    			pusherChannel,
    			messagesChannel,
    			isGameHost,
    			receivedMessages,
    			currentPlayers,
    			me,
    			playerPositions,
    			playerDefaultStartPos,
    			startBallPos,
    			ballPos,
    			scoreline,
    			arenaSize,
    			playerSpeed,
    			konamiEnabled
    		};
    	};

    	$$self.$inject_state = $$props => {
    		if ("pusher" in $$props) $$invalidate("pusher", pusher = $$props.pusher);
    		if ("usertoken" in $$props) $$invalidate("usertoken", usertoken = $$props.usertoken);
    		if ("pusherChannel" in $$props) $$invalidate("pusherChannel", pusherChannel = $$props.pusherChannel);
    		if ("messagesChannel" in $$props) $$invalidate("messagesChannel", messagesChannel = $$props.messagesChannel);
    		if ("isGameHost" in $$props) $$invalidate("isGameHost", isGameHost = $$props.isGameHost);
    		if ("receivedMessages" in $$props) $$invalidate("receivedMessages", receivedMessages = $$props.receivedMessages);
    		if ("currentPlayers" in $$props) $$invalidate("currentPlayers", currentPlayers = $$props.currentPlayers);
    		if ("me" in $$props) $$invalidate("me", me = $$props.me);
    		if ("playerPositions" in $$props) $$invalidate("playerPositions", playerPositions = $$props.playerPositions);
    		if ("playerDefaultStartPos" in $$props) playerDefaultStartPos = $$props.playerDefaultStartPos;
    		if ("startBallPos" in $$props) startBallPos = $$props.startBallPos;
    		if ("ballPos" in $$props) $$invalidate("ballPos", ballPos = $$props.ballPos);
    		if ("scoreline" in $$props) $$invalidate("scoreline", scoreline = $$props.scoreline);
    		if ("arenaSize" in $$props) arenaSize = $$props.arenaSize;
    		if ("playerSpeed" in $$props) playerSpeed = $$props.playerSpeed;
    		if ("konamiEnabled" in $$props) konamiEnabled = $$props.konamiEnabled;
    	};

    	return {
    		pusher,
    		usertoken,
    		pusherChannel,
    		messagesChannel,
    		isGameHost,
    		receivedMessages,
    		currentPlayers,
    		me,
    		playerPositions,
    		ballPos,
    		scoreline,
    		onSubmit,
    		onPlayerControl,
    		onGoal,
    		onBallCollide,
    		onKonami
    	};
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$8, create_fragment$8, safe_not_equal, {
    			pusher: 0,
    			usertoken: 0,
    			pusherChannel: 0,
    			messagesChannel: 0,
    			isGameHost: 0
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get pusher() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pusher(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get usertoken() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set usertoken(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get pusherChannel() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set pusherChannel(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get messagesChannel() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set messagesChannel(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isGameHost() {
    		throw new Error("<App>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isGameHost(value) {
    		throw new Error("<App>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
