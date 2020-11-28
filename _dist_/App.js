import { setComponentTemplate as _setComponentTemplate } from "../web_modules/@glimmer/core.js";

var _class, _descriptor, _descriptor2, _temp;

function _initializerDefineProperty(target, property, descriptor, context) { if (!descriptor) return; Object.defineProperty(target, property, { enumerable: descriptor.enumerable, configurable: descriptor.configurable, writable: descriptor.writable, value: descriptor.initializer ? descriptor.initializer.call(context) : void 0 }); }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) { var desc = {}; Object.keys(descriptor).forEach(function (key) { desc[key] = descriptor[key]; }); desc.enumerable = !!desc.enumerable; desc.configurable = !!desc.configurable; if ('value' in desc || desc.initializer) { desc.writable = true; } desc = decorators.slice().reverse().reduce(function (desc, decorator) { return decorator(target, property, desc) || desc; }, desc); if (context && desc.initializer !== void 0) { desc.value = desc.initializer ? desc.initializer.call(context) : void 0; desc.initializer = undefined; } if (desc.initializer === void 0) { Object.defineProperty(target, property, desc); desc = null; } return desc; }

function _initializerWarningHelper(descriptor, context) { throw new Error('Decorating class property failed. Please ensure that ' + 'proposal-class-properties is enabled and runs after the decorators transform.'); }

import Component, { tracked } from '../web_modules/@glimmerx/component.js';
import { on, action } from '../web_modules/@glimmerx/modifier.js';
import './App.css.proxy.js';
import logo from './logo.svg.proxy.js';

let App = _setComponentTemplate({
  id: "zFkD7tc2",
  block: "{\"symbols\":[\"item\"],\"statements\":[[1,1,0,0,\"\\n   \"],[9,\"div\",true],[12,\"id\",\"intro\",null],[10],[1,1,0,0,\"\\n      \"],[9,\"img\",true],[13,\"src\",[27,[24,0],[\"logo\"]],null],[10],[11],[1,1,0,0,\"\\n      \"],[9,\"h1\",true],[10],[1,1,0,0,\"Todo-List: Glimmer + Snowpack\"],[11],[1,1,0,0,\"\\n      \"],[9,\"ol\",true],[10],[1,1,0,0,\"\\n\"],[5,[27,[26,0,\"BlockHead\"],[]],[[27,[24,0],[\"items\"]]],null,[[\"default\"],[{\"statements\":[[1,1,0,0,\"      \"],[9,\"li\",true],[10],[1,0,0,0,[27,[24,1],[]]],[11],[1,1,0,0,\"\\n\"]],\"parameters\":[1]}]]],[1,1,0,0,\"      \"],[11],[1,1,0,0,\"\\n      \"],[9,\"p\",true],[10],[1,1,0,0,\"What needs to be done?\"],[11],[1,1,0,0,\"\\n      \"],[9,\"p\",true],[10],[9,\"input\",false],[23,\"class\",\"todo-input\",null],[14,\"value\",[27,[24,0],[\"task\"]],null],[23,\"type\",\"text\",null],[3,0,0,[27,[26,1,\"ModifierHead\"],[]],[\"input\",[27,[24,0],[\"updateTask\"]]],null],[10],[11],[11],[1,1,0,0,\"\\n      \"],[9,\"p\",true],[10],[9,\"button\",false],[23,\"class\",\"add-btn\",null],[23,\"type\",\"button\",null],[3,0,0,[27,[26,1,\"ModifierHead\"],[]],[\"click\",[27,[24,0],[\"addTodo\"]]],null],[10],[1,1,0,0,\"Add #\"],[1,0,0,0,[27,[24,0],[\"count\"]]],[11],[11],[1,1,0,0,\"\\n   \"],[11]],\"hasEval\":false,\"upvars\":[\"each\",\"on\"]}",
  meta: {
    scope: () => ({
      on: on
    })
  }
}, (_class = (_temp = class App extends Component {
  constructor(...args) {
    super(...args);

    _initializerDefineProperty(this, "items", _descriptor, this);

    _initializerDefineProperty(this, "task", _descriptor2, this);
  }

  addTodo() {
    this.items = this.items.concat(this.task);
    this.task = '';
  }

  updateTask(ev) {
    this.task = ev.target.value;
  }

  get count() {
    return this.items.length + 1;
  }

}, _temp), (_descriptor = _applyDecoratedDescriptor(_class.prototype, "items", [tracked], {
  configurable: true,
  enumerable: true,
  writable: true,
  initializer: function () {
    return [];
  }
}), _descriptor2 = _applyDecoratedDescriptor(_class.prototype, "task", [tracked], {
  configurable: true,
  enumerable: true,
  writable: true,
  initializer: function () {
    return '';
  }
}), _applyDecoratedDescriptor(_class.prototype, "addTodo", [action], Object.getOwnPropertyDescriptor(_class.prototype, "addTodo"), _class.prototype), _applyDecoratedDescriptor(_class.prototype, "updateTask", [action], Object.getOwnPropertyDescriptor(_class.prototype, "updateTask"), _class.prototype)), _class));

export { App as default };