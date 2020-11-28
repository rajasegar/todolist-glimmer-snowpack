import { c as capabilities, a as setOwner, b as setComponentManager, t as trackedData } from '../common/index-4c57f0ab.js';

const DESTROYING = new WeakMap();
const DESTROYED = new WeakMap();
function setDestroying(component) {
    DESTROYING.set(component, true);
}
function setDestroyed(component) {
    DESTROYED.set(component, true);
}
/**
 * The `Component` class defines an encapsulated UI element that is rendered to
 * the DOM. A component is made up of a template and, optionally, this component
 * object.
 *
 * ## Defining a Component
 *
 * To define a component, subclass `Component` and add your own properties,
 * methods and lifecycle hooks:
 *
 * ```ts
 * import Component from '@glimmer/component';
 *
 * export default class extends Component {
 * }
 * ```
 *
 * ## Lifecycle Hooks
 *
 * Lifecycle hooks allow you to respond to changes to a component, such as when
 * it gets created, rendered, updated or destroyed. To add a lifecycle hook to a
 * component, implement the hook as a method on your component subclass.
 *
 * For example, to be notified when Glimmer has rendered your component so you
 * can attach a legacy jQuery plugin, implement the `didInsertElement()` method:
 *
 * ```ts
 * import Component from '@glimmer/component';
 *
 * export default class extends Component {
 *   didInsertElement() {
 *     $(this.element).pickadate();
 *   }
 * }
 * ```
 *
 * ## Data for Templates
 *
 * `Component`s have two different kinds of data, or state, that can be
 * displayed in templates:
 *
 * 1. Arguments
 * 2. Properties
 *
 * Arguments are data that is passed in to a component from its parent
 * component. For example, if I have a `UserGreeting` component, I can pass it
 * a name and greeting to use:
 *
 * ```hbs
 * <UserGreeting @name="Ricardo" @greeting="Olá" />
 * ```
 *
 * Inside my `UserGreeting` template, I can access the `@name` and `@greeting`
 * arguments that I've been given:
 *
 * ```hbs
 * {{@greeting}}, {{@name}}!
 * ```
 *
 * Arguments are also available inside my component:
 *
 * ```ts
 * console.log(this.args.greeting); // prints "Olá"
 * ```
 *
 * Properties, on the other hand, are internal to the component and declared in
 * the class. You can use properties to store data that you want to show in the
 * template, or pass to another component as an argument.
 *
 * ```ts
 * import Component from '@glimmer/component';
 *
 * export default class extends Component {
 *   user = {
 *     name: 'Robbie'
 *   }
 * }
 * ```
 *
 * In the above example, we've defined a component with a `user` property that
 * contains an object with its own `name` property.
 *
 * We can render that property in our template:
 *
 * ```hbs
 * Hello, {{user.name}}!
 * ```
 *
 * We can also take that property and pass it as an argument to the
 * `UserGreeting` component we defined above:
 *
 * ```hbs
 * <UserGreeting @greeting="Hello" @name={{user.name}} />
 * ```
 *
 * ## Arguments vs. Properties
 *
 * Remember, arguments are data that was given to your component by its parent
 * component, and properties are data your component has defined for itself.
 *
 * You can tell the difference between arguments and properties in templates
 * because arguments always start with an `@` sign (think "A is for arguments"):
 *
 * ```hbs
 * {{@firstName}}
 * ```
 *
 * We know that `@firstName` came from the parent component, not the current
 * component, because it starts with `@` and is therefore an argument.
 *
 * On the other hand, if we see:
 *
 * ```hbs
 * {{name}}
 * ```
 *
 * We know that `name` is a property on the component. If we want to know where
 * the data is coming from, we can go look at our component class to find out.
 *
 * Inside the component itself, arguments always show up inside the component's
 * `args` property. For example, if `{{@firstName}}` is `Tom` in the template,
 * inside the component `this.args.firstName` would also be `Tom`.
 */
class GlimmerComponent {
    /**
     * Constructs a new component and assigns itself the passed properties. You
     * should not construct new components yourself. Instead, Glimmer will
     * instantiate new components automatically as it renders.
     *
     * @param owner
     * @param args
     */
    constructor(_owner, args) {
        this.args = args;
        DESTROYING.set(this, false);
        DESTROYED.set(this, false);
    }
    get isDestroying() {
        return DESTROYING.get(this) || false;
    }
    get isDestroyed() {
        return DESTROYED.get(this) || false;
    }
    /**
     * Called before the component has been removed from the DOM.
     */
    willDestroy() { } // eslint-disable-line @typescript-eslint/no-empty-function
}

class BaseComponentManager {
    constructor(owner) {
        this.owner = owner;
    }
    createComponent(ComponentClass, args) {
        return new ComponentClass(this.owner, args.named);
    }
    getContext(component) {
        return component;
    }
}

const CAPABILITIES = capabilities('3.13', {
    destructor: true,
});
/**
 * This component manager runs in Glimmer.js environments and extends the base component manager to:
 *
 * 1. Implement a lightweight destruction protocol (currently not deferred, like in Ember)
 * 2. Invoke legacy component lifecycle hooks (didInsertElement and didUpdate)
 */
class GlimmerComponentManager extends BaseComponentManager {
    constructor() {
        super(...arguments);
        this.capabilities = CAPABILITIES;
    }
    destroyComponent(component) {
        setDestroying(component);
        component.willDestroy();
        setDestroyed(component);
    }
}

class GlimmerComponent$1 extends GlimmerComponent {
    constructor(owner, args) {
        super(owner, args);
        setOwner(this, owner);
    }
}
setComponentManager((owner) => {
    return new GlimmerComponentManager(owner);
}, GlimmerComponent$1);

/**
 * @decorator
 *
 * Marks a property as tracked.
 *
 * By default, a component's properties are expected to be static,
 * meaning you are not able to update them and have the template update accordingly.
 * Marking a property as tracked means that when that property changes,
 * a rerender of the component is scheduled so the template is kept up to date.
 *
 * @example
 *
 * ```typescript
 * import Component from '@glimmer/component';
 * import { tracked } from '@glimmer/tracking';
 *
 * export default class MyComponent extends Component {
 *    @tracked
 *    remainingApples = 10
 * }
 * ```
 *
 * When something changes the component's `remainingApples` property, the rerender
 * will be scheduled.
 *
 * @example Computed Properties
 *
 * In the case that you have a getter that depends on other properties, tracked
 * properties accessed within the getter will automatically be tracked for you.
 * That means when any of those dependent tracked properties is changed, a
 * rerender of the component will be scheduled.
 *
 * In the following example we have two properties,
 * `eatenApples`, and `remainingApples`.
 *
 *
 * ```typescript
 * import Component from '@glimmer/component';
 * import { tracked } from '@glimmer/tracking';
 *
 * const totalApples = 100;
 *
 * export default class MyComponent extends Component {
 *    @tracked
 *    eatenApples = 0
 *
 *    get remainingApples() {
 *      return totalApples - this.eatenApples;
 *    }
 *
 *    increment() {
 *      this.eatenApples = this.eatenApples + 1;
 *    }
 *  }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tracked = (...args) => {
    const [target, key, descriptor] = args;
    if (descriptor) {
        return descriptorForField(target, key, descriptor);
    }
    // In TypeScript's implementation, decorators on simple class fields do not
    // receive a descriptor, so we define the property on the target directly.
    Object.defineProperty(target, key, descriptorForField(target, key));
};
function descriptorForField(_target, key, desc) {
    const { getter, setter } = trackedData(key, desc && desc.initializer);
    return {
        enumerable: true,
        configurable: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get() {
            return getter(this);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(newValue) {
            setter(this, newValue);
        },
    };
}

export default GlimmerComponent$1;
export { tracked };
