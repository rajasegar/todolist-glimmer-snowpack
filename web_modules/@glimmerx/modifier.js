import { d as setModifierManager, e as capabilities } from '../common/index-4c57f0ab.js';

/* eslint-disable @typescript-eslint/no-unused-vars */
// This function is just used to have an importable value to assign the modifier manager
// to, so it doesn't actually get run. Having the typings is good for documentation
// and discoverabilitity purposes though.
function on(
// @ts-ignore
element, 
// @ts-ignore
eventName, 
// @ts-ignore
callBack, 
// @ts-ignore
options) { } // eslint-disable-line @typescript-eslint/no-empty-function
class OnModifierManager {
    constructor() {
        this.capabilities = capabilities('3.13');
    }
    createModifier(_definition, args) {
        return { args: args, previousArgs: args };
    }
    installModifier(bucket, element) {
        const { args } = bucket;
        const [eventName, listener] = args.positional;
        const named = Object.assign({}, args.named);
        element.addEventListener(eventName, listener, named);
        bucket.element = element;
        bucket.previousArgs = {
            positional: [eventName, listener],
            named,
        };
    }
    updateModifier(bucket) {
        this.destroyModifier(bucket);
        this.installModifier(bucket, bucket.element);
    }
    destroyModifier({ element, previousArgs }) {
        const [eventName, listener] = previousArgs.positional;
        element.removeEventListener(eventName, listener, previousArgs.named);
    }
}
setModifierManager(() => new OnModifierManager(), on);

const BINDINGS_MAP = new WeakMap();
function action(_target, _key, desc) {
    const actionFn = desc.value;
    return {
        enumerable: desc.enumerable,
        configurable: desc.configurable,
        get() {
            let bindings = BINDINGS_MAP.get(this);
            if (bindings === undefined) {
                bindings = new Map();
                BINDINGS_MAP.set(this, bindings);
            }
            let fn = bindings.get(actionFn);
            if (fn === undefined) {
                fn = actionFn.bind(this);
                bindings.set(actionFn, fn);
            }
            return fn;
        },
    };
}

export { action, on };
