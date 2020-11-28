import { r as renderComponent$1 } from '../common/index-4c57f0ab.js';

const SERVICES = Symbol('Services');
class Owner {
    constructor(services) {
        this[SERVICES] = services;
    }
    lookup({ type, name }) {
        return this[SERVICES][name];
    }
}

function renderComponent(ComponentClass, optionsOrElement) {
    if (optionsOrElement instanceof Element) {
        return renderComponent$1(ComponentClass, optionsOrElement);
    }
    const { element, args, services } = optionsOrElement;
    const owner = new Owner(services !== null && services !== void 0 ? services : {});
    return renderComponent$1(ComponentClass, { element, args, owner });
}

export { renderComponent };
