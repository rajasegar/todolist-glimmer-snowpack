import Component, { hbs, tracked } from '@glimmerx/component';
import './App.css';
import logo from './logo.svg';

export default class App extends Component {
  @tracked count = 0;

  constructor() {
    super(...arguments);
    setInterval(() => {
      this.count++;
    }, 1000);
    this.logo = logo;
  }

  static template = hbs`
   <div id="intro">
      <img src={{this.logo}}/>
      <h1>Hello, glimmerx!</h1>
      <h3>
        You can get started by editing <code>src/App.js</code>
      </h3>
      <h2>Time elapsed since start: {{this.count}} seconds</h2>
   </div>`;
}
