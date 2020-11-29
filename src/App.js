import Component, { hbs, tracked } from '@glimmerx/component';
import { on, action } from '@glimmerx/modifier';
import './App.css';
import logo from './logo.svg';

export default class App extends Component {
  @tracked items = [];
  @tracked task = '';
  logo = logo;

  @action addTodo(event) {
    event.preventDefault();
    this.items = this.items.concat(this.task);
    this.task = '';
  }

  @action updateTask(ev) {
    this.task = ev.target.value;
  }

  get count() {
    return this.items.length + 1;
  }


  static template = hbs`
   <div id="intro">
      <img src={{this.logo}}/>
      <h1>Todo-List: Glimmer + Snowpack</h1>
      <ol>
      {{#each this.items as |item|}}
      <li>{{item}}</li>
      {{/each}}
      </ol>
      <p>What needs to be done?</p>
      <form {{on "submit" this.addTodo}}>
      <p><input autofocus class="todo-input" type="text" {{on "input" this.updateTask}} value={{this.task}}/></p>
      <p><button class="add-btn" type="submit">Add #{{this.count}}</button></p>
      </form>
   </div>`;
}
