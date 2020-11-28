const DEBUG = false;

// This is a duplicate utility from @glimmer/util because `@glimmer/validator`
// should not depend on any other @glimmer packages, in order to avoid pulling
// in types and prevent regressions in `@glimmer/tracking` (which has public types).
const symbol = typeof Symbol !== 'undefined' ? Symbol : key => `__${key}${Math.floor(Math.random() * Date.now())}__`;

let runInAutotrackingTransaction;

const INITIAL = 1;

let $REVISION = INITIAL;

const COMPUTE = symbol('TAG_COMPUTE'); //////////

/**
 * `value` receives a tag and returns an opaque Revision based on that tag. This
 * snapshot can then later be passed to `validate` with the same tag to
 * determine if the tag has changed at all since the time that `value` was
 * called.
 *
 * The current implementation returns the global revision count directly for
 * performance reasons. This is an implementation detail, and should not be
 * relied on directly by users of these APIs. Instead, Revisions should be
 * treated as if they are opaque/unknown, and should only be interacted with via
 * the `value`/`validate` API.
 *
 * @param tag
 */

function valueForTag(_tag) {
  return $REVISION;
}
/**
 * `validate` receives a tag and a snapshot from a previous call to `value` with
 * the same tag, and determines if the tag is still valid compared to the
 * snapshot. If the tag's state has changed at all since then, `validate` will
 * return false, otherwise it will return true. This is used to determine if a
 * calculation related to the tags should be rerun.
 *
 * @param tag
 * @param snapshot
 */

function validateTag(tag, snapshot) {
  return snapshot >= tag[COMPUTE]();
}
const TYPE = symbol('TAG_TYPE');

class MonomorphicTagImpl {
  constructor(type) {
    this.revision = INITIAL;
    this.lastChecked = INITIAL;
    this.lastValue = INITIAL;
    this.isUpdating = false;
    this.subtags = null;
    this.subtag = null;
    this.subtagBufferCache = null;
    this[TYPE] = type;
  }

  [COMPUTE]() {
    let {
      lastChecked
    } = this;

    if (this.isUpdating === true) {

      this.lastChecked = ++$REVISION;
    } else if (lastChecked !== $REVISION) {
      this.isUpdating = true;
      this.lastChecked = $REVISION;

      try {
        let {
          subtags,
          subtag,
          subtagBufferCache,
          lastValue,
          revision
        } = this;

        if (subtag !== null) {
          let subtagValue = subtag[COMPUTE]();

          if (subtagValue === subtagBufferCache) {
            revision = Math.max(revision, lastValue);
          } else {
            // Clear the temporary buffer cache
            this.subtagBufferCache = null;
            revision = Math.max(revision, subtagValue);
          }
        }

        if (subtags !== null) {
          for (let i = 0; i < subtags.length; i++) {
            let value = subtags[i][COMPUTE]();
            revision = Math.max(value, revision);
          }
        }

        this.lastValue = revision;
      } finally {
        this.isUpdating = false;
      }
    }

    return this.lastValue;
  }

  static updateTag(_tag, _subtag) {


    let tag = _tag;
    let subtag = _subtag;

    if (subtag === CONSTANT_TAG) {
      tag.subtag = null;
    } else {
      // There are two different possibilities when updating a subtag:
      //
      // 1. subtag[COMPUTE]() <= tag[COMPUTE]();
      // 2. subtag[COMPUTE]() > tag[COMPUTE]();
      //
      // The first possibility is completely fine within our caching model, but
      // the second possibility presents a problem. If the parent tag has
      // already been read, then it's value is cached and will not update to
      // reflect the subtag's greater value. Next time the cache is busted, the
      // subtag's value _will_ be read, and it's value will be _greater_ than
      // the saved snapshot of the parent, causing the resulting calculation to
      // be rerun erroneously.
      //
      // In order to prevent this, when we first update to a new subtag we store
      // its computed value, and then check against that computed value on
      // subsequent updates. If its value hasn't changed, then we return the
      // parent's previous value. Once the subtag changes for the first time,
      // we clear the cache and everything is finally in sync with the parent.
      tag.subtagBufferCache = subtag[COMPUTE]();
      tag.subtag = subtag;
    }
  }

  static dirtyTag(tag) {

    tag.revision = ++$REVISION;
  }

}

const dirtyTag = MonomorphicTagImpl.dirtyTag;
const updateTag = MonomorphicTagImpl.updateTag; //////////

function createTag() {
  return new MonomorphicTagImpl(0
  /* Dirtyable */
  );
}
function createUpdatableTag() {
  return new MonomorphicTagImpl(1
  /* Updatable */
  );
} //////////

const CONSTANT_TAG = new MonomorphicTagImpl(3
/* Constant */
);
function isConst({
  tag
}) {
  return tag === CONSTANT_TAG;
}
function isConstTag(tag) {
  return tag === CONSTANT_TAG;
} //////////

function combine(tags) {
  let optimized = [];

  for (let i = 0, l = tags.length; i < l; i++) {
    let tag = tags[i];
    if (tag === CONSTANT_TAG) continue;
    optimized.push(tag);
  }

  return createCombinatorTag(optimized);
}
function createCombinatorTag(tags) {
  switch (tags.length) {
    case 0:
      return CONSTANT_TAG;

    case 1:
      return tags[0];

    default:
      let tag = new MonomorphicTagImpl(2
      /* Combinator */
      );
      tag.subtags = tags;
      return tag;
  }
}

let propertyDidChange = function () {};
function setPropertyDidChange(cb) {
  propertyDidChange = cb;
}

function isObject(u) {
  return typeof u === 'object' && u !== null || typeof u === 'function';
}

const TRACKED_TAGS = new WeakMap();
function dirtyTagFor(obj, key) {
  if (isObject(obj)) {
    let tags = TRACKED_TAGS.get(obj); // No tags have been setup for this object yet, return

    if (tags === undefined) return; // Dirty the tag for the specific property if it exists

    let propertyTag = tags.get(key);

    if (propertyTag !== undefined) {

      dirtyTag(propertyTag);
      propertyDidChange();
    }
  } else {
    throw new Error(`BUG: Can't update a tag for a primitive`);
  }
}
function tagFor(obj, key) {
  if (isObject(obj)) {
    let tags = TRACKED_TAGS.get(obj);

    if (tags === undefined) {
      tags = new Map();
      TRACKED_TAGS.set(obj, tags);
    } else if (tags.has(key)) {
      return tags.get(key);
    }

    let tag = createUpdatableTag();
    tags.set(key, tag);
    return tag;
  } else {
    return CONSTANT_TAG;
  }
}

/**
 * An object that that tracks @tracked properties that were consumed.
 */

class Tracker {
  constructor() {
    this.tags = new Set();
    this.last = null;
  }

  add(tag) {
    this.tags.add(tag);

    this.last = tag;
  }

  combine() {
    let {
      tags
    } = this;

    if (tags.size === 0) {
      return CONSTANT_TAG;
    } else if (tags.size === 1) {
      return this.last;
    } else {
      let tagsArr = [];
      tags.forEach(tag => tagsArr.push(tag));
      return combine(tagsArr);
    }
  }

}
/**
 * Whenever a tracked computed property is entered, the current tracker is
 * saved off and a new tracker is replaced.
 *
 * Any tracked properties consumed are added to the current tracker.
 *
 * When a tracked computed property is exited, the tracker's tags are
 * combined and added to the parent tracker.
 *
 * The consequence is that each tracked computed property has a tag
 * that corresponds to the tracked properties consumed inside of
 * itself, including child tracked computed properties.
 */


let CURRENT_TRACKER = null;
const OPEN_TRACK_FRAMES = [];
function beginTrackFrame() {
  OPEN_TRACK_FRAMES.push(CURRENT_TRACKER);
  CURRENT_TRACKER = new Tracker();
}
function endTrackFrame() {
  let current = CURRENT_TRACKER;

  CURRENT_TRACKER = OPEN_TRACK_FRAMES.pop();
  return current.combine();
} //////////

function track(callback, debuggingContext) {
  beginTrackFrame();
  let tag;

  try {
    if (DEBUG) ; else {
      callback();
    }
  } finally {
    tag = endTrackFrame();
  }

  return tag;
}
function consumeTag(tag) {
  if (CURRENT_TRACKER !== null) {
    CURRENT_TRACKER.add(tag);
  }
}
function untrack(callback) {
  OPEN_TRACK_FRAMES.push(CURRENT_TRACKER);
  CURRENT_TRACKER = null;

  try {
    callback();
  } finally {
    CURRENT_TRACKER = OPEN_TRACK_FRAMES.pop();
  }
} //////////

const EPOCH = createTag();
function trackedData(key, initializer) {
  let values = new WeakMap();
  let hasInitializer = typeof initializer === 'function';

  function getter(self) {
    consumeTag(tagFor(self, key));
    let value; // If the field has never been initialized, we should initialize it

    if (hasInitializer && !values.has(self)) {
      value = initializer.call(self);
      values.set(self, value);
    } else {
      value = values.get(self);
    }

    return value;
  }

  function setter(self, value) {

    dirtyTag(EPOCH);
    dirtyTagFor(self, key);
    values.set(self, value);
  }

  return {
    getter,
    setter
  };
}

const EMPTY_ARRAY = Object.freeze([]);

// import Logger from './logger';
// let alreadyWarned = false;
function debugAssert(test, msg) {
  // if (!alreadyWarned) {
  //   alreadyWarned = true;
  //   Logger.warn("Don't leave debug assertions on in public builds");
  // }
  if (!test) {
    throw new Error(msg || 'assertion failure');
  }
}

let GUID = 0;
function initializeGuid(object) {
  return object._guid = ++GUID;
}

function dict() {
  return Object.create(null);
}
function isDict(u) {
  return u !== null && u !== undefined;
}
function isObject$1(u) {
  return typeof u === 'object' && u !== null;
}
class StackImpl {
  constructor() {
    this.stack = [];
    this.current = null;
  }

  get size() {
    return this.stack.length;
  }

  push(item) {
    this.current = item;
    this.stack.push(item);
  }

  pop() {
    let item = this.stack.pop();
    let len = this.stack.length;
    this.current = len === 0 ? null : this.stack[len - 1];
    return item === undefined ? null : item;
  }

  nth(from) {
    let len = this.stack.length;
    return len < from ? null : this.stack[len - from];
  }

  isEmpty() {
    return this.stack.length === 0;
  }

  toArray() {
    return this.stack;
  }

}

function unreachable(message = 'unreachable') {
  return new Error(message);
}
function exhausted(value) {
  throw new Error(`Exhausted ${value}`);
}
const symbol$1 = typeof Symbol !== 'undefined' ? Symbol : key => `__${key}${Math.floor(Math.random() * Date.now())}__`;

const DESTROY = symbol$1('DESTROY');
function isDestroyable(value) {
  return !!(value && value[DESTROY] !== undefined);
}
function isStringDestroyable(value) {
  return !!(value && typeof value === 'object' && typeof value.destroy === 'function');
}

function clearElement(parent) {
  let current = parent.firstChild;

  while (current) {
    let next = current.nextSibling;
    parent.removeChild(current);
    current = next;
  }
}

const LINKED = new WeakMap();
const WILL_DROP = symbol$1('WILL_DROP');
const DID_DROP = symbol$1('DID_DROP');
const CHILDREN = symbol$1('CHILDREN');
const DESTRUCTORS = new WeakMap();
function isDrop(value) {
  if (value === null || typeof value !== 'object') return false;
  return value[DID_DROP] !== undefined;
}
function associate(parent, child) {
  associateDestructor(parent, destructor(child));
}
function associateDestructor(parent, child) {
  let associated = LINKED.get(parent);

  if (!associated) {
    associated = new Set();
    LINKED.set(parent, associated);
  }

  associated.add(child);
}
function peekAssociated(parent) {
  return LINKED.get(parent) || null;
}
function takeAssociated(parent) {
  let linked = LINKED.get(parent);

  if (linked && linked.size > 0) {
    LINKED.delete(parent);
    return linked;
  } else {
    return null;
  }
}
function willDestroyAssociated(parent) {
  let associated = LINKED.get(parent);

  if (associated) {
    associated.forEach(item => {
      item[WILL_DROP]();
    });
  }
}
function didDestroyAssociated(parent) {
  let associated = LINKED.get(parent);

  if (associated) {
    associated.forEach(item => {
      item[DID_DROP]();
      associated.delete(item);
    });
  }
}
function destructor(value) {
  let d = DESTRUCTORS.get(value);

  if (!d) {
    if (isDestroyable(value)) {
      d = new DestroyableDestructor(value);
    } else if (isStringDestroyable(value)) {
      d = new StringDestroyableDestructor(value);
    } else {
      d = new SimpleDestructor(value);
    }

    DESTRUCTORS.set(value, d);
  }

  return d;
}
function snapshot(values) {
  return new SnapshotDestructor(values);
}

class SnapshotDestructor {
  constructor(destructors) {
    this.destructors = destructors;
  }

  [WILL_DROP]() {
    this.destructors.forEach(item => item[WILL_DROP]());
  }

  [DID_DROP]() {
    this.destructors.forEach(item => item[DID_DROP]());
  }

  get [CHILDREN]() {
    return this.destructors;
  }

  toString() {
    return 'SnapshotDestructor';
  }

}

class DestroyableDestructor {
  constructor(inner) {
    this.inner = inner;
  }

  [WILL_DROP]() {
    willDestroyAssociated(this.inner);
  }

  [DID_DROP]() {
    this.inner[DESTROY]();
    didDestroyAssociated(this.inner);
  }

  get [CHILDREN]() {
    return LINKED.get(this.inner) || [];
  }

  toString() {
    return 'DestroyableDestructor';
  }

}

class StringDestroyableDestructor {
  constructor(inner) {
    this.inner = inner;
  }

  [WILL_DROP]() {
    if (typeof this.inner.willDestroy === 'function') {
      this.inner.willDestroy();
    }

    willDestroyAssociated(this.inner);
  }

  [DID_DROP]() {
    this.inner.destroy();
    didDestroyAssociated(this.inner);
  }

  get [CHILDREN]() {
    return LINKED.get(this.inner) || [];
  }

  toString() {
    return 'StringDestroyableDestructor';
  }

}

class SimpleDestructor {
  constructor(inner) {
    this.inner = inner;
  }

  [WILL_DROP]() {
    willDestroyAssociated(this.inner);
  }

  [DID_DROP]() {
    didDestroyAssociated(this.inner);
  }

  get [CHILDREN]() {
    return LINKED.get(this.inner) || [];
  }

  toString() {
    return 'SimpleDestructor';
  }

}

class ListNode {
  constructor(value) {
    this.next = null;
    this.prev = null;
    this.value = value;
  }

}
class LinkedList {
  constructor() {
    this.clear();
  }

  head() {
    return this._head;
  }

  tail() {
    return this._tail;
  }

  clear() {
    this._head = this._tail = null;
  }

  toArray() {
    let out = [];
    this.forEachNode(n => out.push(n));
    return out;
  }

  nextNode(node) {
    return node.next;
  }

  forEachNode(callback) {
    let node = this._head;

    while (node !== null) {
      callback(node);
      node = node.next;
    }
  }

  insertBefore(node, reference = null) {
    if (reference === null) return this.append(node);
    if (reference.prev) reference.prev.next = node;else this._head = node;
    node.prev = reference.prev;
    node.next = reference;
    reference.prev = node;
    return node;
  }

  append(node) {
    let tail = this._tail;

    if (tail) {
      tail.next = node;
      node.prev = tail;
      node.next = null;
    } else {
      this._head = node;
    }

    return this._tail = node;
  }

  remove(node) {
    if (node.prev) node.prev.next = node.next;else this._head = node.next;
    if (node.next) node.next.prev = node.prev;else this._tail = node.prev;
    return node;
  }

  [WILL_DROP]() {
    this.forEachNode(d => destructor(d)[WILL_DROP]());
  }

  [DID_DROP]() {
    this.forEachNode(d => destructor(d)[DID_DROP]());
  }

  get [CHILDREN]() {
    let out = [];
    this.forEachNode(d => out.push(...destructor(d)[CHILDREN]));
    return out;
  }

}
class ListSlice {
  constructor(head, tail) {
    this._head = head;
    this._tail = tail;
  }

  forEachNode(callback) {
    let node = this._head;

    while (node !== null) {
      callback(node);
      node = this.nextNode(node);
    }
  }

  head() {
    return this._head;
  }

  tail() {
    return this._tail;
  }

  toArray() {
    let out = [];
    this.forEachNode(n => out.push(n));
    return out;
  }

  nextNode(node) {
    if (node === this._tail) return null;
    return node.next;
  }

}

const {
  keys: objKeys
} = Object;
function assign(obj) {
  for (let i = 1; i < arguments.length; i++) {
    let assignment = arguments[i];
    if (assignment === null || typeof assignment !== 'object') continue;
    let keys = objKeys(assignment);

    for (let j = 0; j < keys.length; j++) {
      let key = keys[j];
      obj[key] = assignment[key];
    }
  }

  return obj;
}
function fillNulls(count) {
  let arr = new Array(count);

  for (let i = 0; i < count; i++) {
    arr[i] = null;
  }

  return arr;
}

/**
 * Encodes a value that can be stored directly instead of being a handle.
 *
 * Immediates use the positive half of 32bits
 *
 * @param value - the value to be encoded.
 */


function encodeImmediate(value) {
  if (typeof value === 'number') {
    // 1073741827 - (-1) == 1073741828
    // 1073741827 - (-1073741820) == 2147483647
    // positive it stays as is
    // 0 - 1073741823


    return value < 0 ? 1073741827
    /* NEGATIVE_BASE */
    - value : value;
  }

  if (value === false) {
    return 1073741824
    /* FALSE */
    ;
  }

  if (value === true) {
    return 1073741825
    /* TRUE */
    ;
  }

  if (value === null) {
    return 1073741826
    /* NULL */
    ;
  }

  if (value === undefined) {
    return 1073741827
    /* UNDEFINED */
    ;
  }

  return exhausted(value);
}
/**
 * Decodes an immediate into its value.
 *
 * @param value - the encoded immediate value
 */

function decodeImmediate(value) {

  if (value > 1073741823
  /* MAX_INT */
  ) {
      switch (value) {
        case 1073741824
        /* FALSE */
        :
          return false;

        case 1073741825
        /* TRUE */
        :
          return true;

        case 1073741826
        /* NULL */
        :
          return null;

        case 1073741827
        /* UNDEFINED */
        :
          return undefined;

        default:
          // map 1073741828 to 2147483647 to -1 to -1073741820
          // 1073741827 - 1073741828 == -1
          // 1073741827 - 2147483647 == -1073741820
          return 1073741827
          /* NEGATIVE_BASE */
          - value;
      }
    }

  return value;
}
/**
 * True if the number can be stored directly or false if it needs a handle.
 *
 * This is used on any number type to see if it can be directly encoded.
 */

function isSmallInt(num) {
  return isInt(num, -1073741820
  /* MIN_INT */
  , 1073741823
  /* MAX_INT */
  );
}
/**
 * True if the encoded int32 operand or encoded stack int32 is a handle.
 */

function isHandle(encoded) {

  return encoded < 0;
}
/**
 * Encodes an index to an operand or stack handle.
 */

function encodeHandle(index, maxIndex = 2147483647
/* MAX_INDEX */
, maxHandle = -1
/* MAX_HANDLE */
) {

  if (index > maxIndex) {
    throw new Error(`index ${index} overflowed range 0 to ${maxIndex}`);
  } // -1 - 0 == -1
  // -1 - 1073741823 == -1073741824
  // -1073741825 - 0 == -1073741825
  // -1073741825 - 1073741823 == -2147483648


  return maxHandle - index;
}
/**
 * Decodes the index from the specified operand or stack handle.
 */

function decodeHandle(handle, maxHandle = -1
/* MAX_HANDLE */
) {
  // -1 - -1073741824 == 1073741823
  // -1073741825 - -1073741825 == 0
  // -1073741825 - -2147483648 == 1073741823


  return maxHandle - handle;
}

function isInt(num, min, max) {
  // this is the same as Math.floor(num) === num
  // also NaN % 1 is NaN and Infinity % 1 is NaN so both should fail
  return num % 1 === 0 && num >= min && num <= max;
}

function unwrapHandle(handle) {
  if (typeof handle === 'number') {
    return handle;
  } else {
    let error = handle.errors[0];
    throw new Error(`Compile Error: ${error.problem} @ ${error.span.start}..${error.span.end}`);
  }
}
function unwrapTemplate(template) {
  if (template.result === 'error') {
    throw new Error(`Compile Error: ${template.problem} @ ${template.span.start}..${template.span.end}`);
  }

  return template;
}

function assertNever(value, desc = 'unexpected unreachable branch') {
  console.log('unreachable', value);
  console.trace(`${desc} :: ${JSON.stringify(value)} (${value})`);
}

/* This file is generated by build/debug.js */
function isMachineOp(value) {
  return value >= 0 && value <= 15;
}

/**
 * Registers
 *
 * For the most part, these follows MIPS naming conventions, however the
 * register numbers are different.
 */
// $0 or $pc (program counter): pointer into `program` for the next insturction; -1 means exit
const $pc = 0; // $1 or $ra (return address): pointer into `program` for the return

const $ra = 1; // $2 or $fp (frame pointer): pointer into the `evalStack` for the base of the stack

const $fp = 2; // $3 or $sp (stack pointer): pointer into the `evalStack` for the top of the stack

const $sp = 3; // $4-$5 or $s0-$s1 (saved): callee saved general-purpose registers

const $s0 = 4;
const $s1 = 5; // $6-$7 or $t0-$t1 (temporaries): caller saved general-purpose registers

const $t0 = 6;
const $t1 = 7; // $8 or $v0 (return value)

const $v0 = 8;
function isLowLevelRegister(register) {
  return register <= $sp;
}
var SavedRegister;

(function (SavedRegister) {
  SavedRegister[SavedRegister["s0"] = 4] = "s0";
  SavedRegister[SavedRegister["s1"] = 5] = "s1";
})(SavedRegister || (SavedRegister = {}));

var TemporaryRegister;

(function (TemporaryRegister) {
  TemporaryRegister[TemporaryRegister["t0"] = 6] = "t0";
  TemporaryRegister[TemporaryRegister["t1"] = 7] = "t1";
})(TemporaryRegister || (TemporaryRegister = {}));

// the VM in other classes, but are not intended to be a part of
// Glimmer's API.

const INNER_VM = symbol$1('INNER_VM');
const DESTRUCTOR_STACK = symbol$1('DESTRUCTOR_STACK');
const STACKS = symbol$1('STACKS');
const REGISTERS = symbol$1('REGISTERS');
const HEAP = symbol$1('HEAP');
const CONSTANTS = symbol$1('CONSTANTS');
const ARGS = symbol$1('ARGS');

class CursorImpl {
  constructor(element, nextSibling) {
    this.element = element;
    this.nextSibling = nextSibling;
  }

}
class ConcreteBounds {
  constructor(parentNode, first, last) {
    this.parentNode = parentNode;
    this.first = first;
    this.last = last;
  }

  parentElement() {
    return this.parentNode;
  }

  firstNode() {
    return this.first;
  }

  lastNode() {
    return this.last;
  }

}
class SingleNodeBounds {
  constructor(parentNode, node) {
    this.parentNode = parentNode;
    this.node = node;
  }

  parentElement() {
    return this.parentNode;
  }

  firstNode() {
    return this.node;
  }

  lastNode() {
    return this.node;
  }

}
function move(bounds, reference) {
  let parent = bounds.parentElement();
  let first = bounds.firstNode();
  let last = bounds.lastNode();
  let current = first;

  while (true) {
    let next = current.nextSibling;
    parent.insertBefore(current, reference);

    if (current === last) {
      return next;
    }

    current = next;
  }
}
function clear(bounds) {
  let parent = bounds.parentElement();
  let first = bounds.firstNode();
  let last = bounds.lastNode();
  let current = first;

  while (true) {
    let next = current.nextSibling;
    parent.removeChild(current);

    if (current === last) {
      return next;
    }

    current = next;
  }
}

function legacySyncReset(parent, env) {
  let linked = peekAssociated(parent);

  if (linked !== null) {
    env.willDestroy(snapshot(linked));
  }
}
function asyncReset(parent, env) {
  let linked = takeAssociated(parent);

  if (linked !== null) {
    env.didDestroy(snapshot(linked));
  }
}
function legacySyncDestroy(parent, env) {

  env.willDestroy(destructor(parent));
}
function asyncDestroy(parent, env) {

  env.didDestroy(destructor(parent));
}
function detach(parent, env) {

  legacySyncDestroy(parent, env);
  clear(parent);
  asyncDestroy(parent, env);
}
function detachChildren(parent, env) {

  legacySyncReset(parent, env);
  asyncReset(parent, env);
  return clear(parent);
}

var _a;

class First {
  constructor(node) {
    this.node = node;
  }

  firstNode() {
    return this.node;
  }

}

class Last {
  constructor(node) {
    this.node = node;
  }

  lastNode() {
    return this.node;
  }

}
const CURSOR_STACK = symbol$1('CURSOR_STACK');
class NewElementBuilder {
  constructor(env, parentNode, nextSibling) {
    this.constructing = null;
    this.operations = null;
    this[_a] = new StackImpl();
    this.modifierStack = new StackImpl();
    this.blockStack = new StackImpl();
    this.pushElement(parentNode, nextSibling);
    this.env = env;
    this.dom = env.getAppendOperations();
    this.updateOperations = env.getDOM();
  }

  static forInitialRender(env, cursor) {
    return new this(env, cursor.element, cursor.nextSibling).initialize();
  }

  static resume(env, block) {
    let parentNode = block.parentElement();
    let nextSibling = block.reset(env);
    let stack = new this(env, parentNode, nextSibling).initialize();
    stack.pushLiveBlock(block);
    return stack;
  }

  initialize() {
    this.pushSimpleBlock();
    return this;
  }

  debugBlocks() {
    return this.blockStack.toArray();
  }

  get element() {
    return this[CURSOR_STACK].current.element;
  }

  get nextSibling() {
    return this[CURSOR_STACK].current.nextSibling;
  }

  get hasBlocks() {
    return this.blockStack.size > 0;
  }

  block() {
    return this.blockStack.current;
  }

  popElement() {
    this[CURSOR_STACK].pop();
    this[CURSOR_STACK].current;
  }

  pushSimpleBlock() {
    return this.pushLiveBlock(new SimpleLiveBlock(this.element));
  }

  pushUpdatableBlock() {
    return this.pushLiveBlock(new UpdatableBlockImpl(this.element));
  }

  pushBlockList(list) {
    return this.pushLiveBlock(new LiveBlockList(this.element, list));
  }

  pushLiveBlock(block, isRemote = false) {
    let current = this.blockStack.current;

    if (current !== null) {
      if (!isRemote) {
        current.didAppendBounds(block);
      }
    }

    this.__openBlock();

    this.blockStack.push(block);
    return block;
  }

  popBlock() {
    this.block().finalize(this);

    this.__closeBlock();

    return this.blockStack.pop();
  }

  __openBlock() {}

  __closeBlock() {} // todo return seems unused


  openElement(tag) {
    let element = this.__openElement(tag);

    this.constructing = element;
    return element;
  }

  __openElement(tag) {
    return this.dom.createElement(tag, this.element);
  }

  flushElement(modifiers) {
    let parent = this.element;
    let element = this.constructing;

    this.__flushElement(parent, element);

    this.constructing = null;
    this.operations = null;
    this.pushModifiers(modifiers);
    this.pushElement(element, null);
    this.didOpenElement(element);
  }

  __flushElement(parent, constructing) {
    this.dom.insertBefore(parent, constructing, this.nextSibling);
  }

  closeElement() {
    this.willCloseElement();
    this.popElement();
    return this.popModifiers();
  }

  pushRemoteElement(element, guid, insertBefore) {
    return this.__pushRemoteElement(element, guid, insertBefore);
  }

  __pushRemoteElement(element, _guid, insertBefore) {
    this.pushElement(element, insertBefore);

    if (insertBefore === undefined) {
      while (element.lastChild) {
        element.removeChild(element.lastChild);
      }
    }

    let block = new RemoteLiveBlock(element);
    return this.pushLiveBlock(block, true);
  }

  popRemoteElement() {
    this.popBlock();
    this.popElement();
  }

  pushElement(element, nextSibling = null) {
    this[CURSOR_STACK].push(new CursorImpl(element, nextSibling));
  }

  pushModifiers(modifiers) {
    this.modifierStack.push(modifiers);
  }

  popModifiers() {
    return this.modifierStack.pop();
  }

  didAppendBounds(bounds) {
    this.block().didAppendBounds(bounds);
    return bounds;
  }

  didAppendNode(node) {
    this.block().didAppendNode(node);
    return node;
  }

  didOpenElement(element) {
    this.block().openElement(element);
    return element;
  }

  willCloseElement() {
    this.block().closeElement();
  }

  appendText(string) {
    return this.didAppendNode(this.__appendText(string));
  }

  __appendText(text) {
    let {
      dom,
      element,
      nextSibling
    } = this;
    let node = dom.createTextNode(text);
    dom.insertBefore(element, node, nextSibling);
    return node;
  }

  __appendNode(node) {
    this.dom.insertBefore(this.element, node, this.nextSibling);
    return node;
  }

  __appendFragment(fragment) {
    let first = fragment.firstChild;

    if (first) {
      let ret = new ConcreteBounds(this.element, first, fragment.lastChild);
      this.dom.insertBefore(this.element, fragment, this.nextSibling);
      return ret;
    } else {
      return new SingleNodeBounds(this.element, this.__appendComment(''));
    }
  }

  __appendHTML(html) {
    return this.dom.insertHTMLBefore(this.element, this.nextSibling, html);
  }

  appendDynamicHTML(value) {
    let bounds = this.trustedContent(value);
    this.didAppendBounds(bounds);
  }

  appendDynamicText(value) {
    let node = this.untrustedContent(value);
    this.didAppendNode(node);
    return node;
  }

  appendDynamicFragment(value) {
    let bounds = this.__appendFragment(value);

    this.didAppendBounds(bounds);
  }

  appendDynamicNode(value) {
    let node = this.__appendNode(value);

    let bounds = new SingleNodeBounds(this.element, node);
    this.didAppendBounds(bounds);
  }

  trustedContent(value) {
    return this.__appendHTML(value);
  }

  untrustedContent(value) {
    return this.__appendText(value);
  }

  appendComment(string) {
    return this.didAppendNode(this.__appendComment(string));
  }

  __appendComment(string) {
    let {
      dom,
      element,
      nextSibling
    } = this;
    let node = dom.createComment(string);
    dom.insertBefore(element, node, nextSibling);
    return node;
  }

  __setAttribute(name, value, namespace) {
    this.dom.setAttribute(this.constructing, name, value, namespace);
  }

  __setProperty(name, value) {
    this.constructing[name] = value;
  }

  setStaticAttribute(name, value, namespace) {
    this.__setAttribute(name, value, namespace);
  }

  setDynamicAttribute(name, value, trusting, namespace) {
    let element = this.constructing;
    let attribute = this.env.attributeFor(element, name, trusting, namespace);
    attribute.set(this, value, this.env);
    return attribute;
  }

}
_a = CURSOR_STACK;
class SimpleLiveBlock {
  constructor(parent) {
    this.parent = parent;
    this.first = null;
    this.last = null;
    this.destroyables = null;
    this.nesting = 0;
  }

  parentElement() {
    return this.parent;
  }

  firstNode() {
    let first = this.first;
    return first.firstNode();
  }

  lastNode() {
    let last = this.last;
    return last.lastNode();
  }

  openElement(element) {
    this.didAppendNode(element);
    this.nesting++;
  }

  closeElement() {
    this.nesting--;
  }

  didAppendNode(node) {
    if (this.nesting !== 0) return;

    if (!this.first) {
      this.first = new First(node);
    }

    this.last = new Last(node);
  }

  didAppendBounds(bounds) {
    if (this.nesting !== 0) return;

    if (!this.first) {
      this.first = bounds;
    }

    this.last = bounds;
  }

  finalize(stack) {
    if (this.first === null) {
      stack.appendComment('');
    }
  }

}
class RemoteLiveBlock extends SimpleLiveBlock {
  [DESTROY]() {
    // In general, you only need to clear the root of a hierarchy, and should never
    // need to clear any child nodes. This is an important constraint that gives us
    // a strong guarantee that clearing a subtree is a single DOM operation.
    //
    // Because remote blocks are not normally physically nested inside of the tree
    // that they are logically nested inside, we manually clear remote blocks when
    // a logical parent is cleared.
    //
    // HOWEVER, it is currently possible for a remote block to be physically nested
    // inside of the block it is logically contained inside of. This happens when
    // the remote block is appended to the end of the application's entire element.
    //
    // The problem with that scenario is that Glimmer believes that it owns more of
    // the DOM than it actually does. The code is attempting to write past the end
    // of the Glimmer-managed root, but Glimmer isn't aware of that.
    //
    // The correct solution to that problem is for Glimmer to be aware of the end
    // of the bounds that it owns, and once we make that change, this check could
    // be removed.
    //
    // For now, a more targeted fix is to check whether the node was already removed
    // and avoid clearing the node if it was. In most cases this shouldn't happen,
    // so this might hide bugs where the code clears nested nodes unnecessarily,
    // so we should eventually try to do the correct fix.
    if (this.parentElement() === this.firstNode().parentNode) {
      clear(this);
    }
  }

}
class UpdatableBlockImpl extends SimpleLiveBlock {
  reset(env) {
    let nextSibling = detachChildren(this, env); // let nextSibling = clear(this);

    this.first = null;
    this.last = null;
    this.destroyables = null;
    this.nesting = 0;
    return nextSibling;
  }

} // FIXME: All the noops in here indicate a modelling problem

class LiveBlockList {
  constructor(parent, boundList) {
    this.parent = parent;
    this.boundList = boundList;
    this.parent = parent;
    this.boundList = boundList;
  }

  parentElement() {
    return this.parent;
  }

  firstNode() {
    let head = this.boundList.head();
    return head.firstNode();
  }

  lastNode() {
    let tail = this.boundList.tail();
    return tail.lastNode();
  }

  openElement(_element) {
  }

  closeElement() {
  }

  didAppendNode(_node) {
  }

  didAppendBounds(_bounds) {}

  finalize(_stack) {
  }

}

function clientBuilder(env, cursor) {
  return NewElementBuilder.forInitialRender(env, cursor);
}

class CachedReference {
  constructor() {
    this.lastRevision = null;
    this.lastValue = null;
  }

  value() {
    let {
      tag,
      lastRevision,
      lastValue
    } = this;

    if (lastRevision === null || !validateTag(tag, lastRevision)) {
      lastValue = this.lastValue = this.compute();
      this.lastRevision = valueForTag();
    }

    return lastValue;
  }

  invalidate() {
    this.lastRevision = null;
  }

} //////////

class ReferenceCache {
  constructor(reference) {
    this.lastValue = null;
    this.lastRevision = null;
    this.initialized = false;
    this.tag = reference.tag;
    this.reference = reference;
  }

  peek() {
    if (!this.initialized) {
      return this.initialize();
    }

    return this.lastValue;
  }

  revalidate() {
    if (!this.initialized) {
      return this.initialize();
    }

    let {
      reference,
      lastRevision
    } = this;
    let tag = reference.tag;
    if (validateTag(tag, lastRevision)) return NOT_MODIFIED;
    let {
      lastValue
    } = this;
    let currentValue = reference.value();
    this.lastRevision = valueForTag();
    if (currentValue === lastValue) return NOT_MODIFIED;
    this.lastValue = currentValue;
    return currentValue;
  }

  initialize() {
    let {
      reference
    } = this;
    let currentValue = this.lastValue = reference.value();
    this.lastRevision = valueForTag(reference.tag);
    this.initialized = true;
    return currentValue;
  }

}
const NOT_MODIFIED = symbol$1('NOT_MODIFIED');
function isModified(value) {
  return value !== NOT_MODIFIED;
}

class PrimitiveReference {
  constructor(inner) {
    this.inner = inner;
    this.tag = CONSTANT_TAG;
  }

  value() {
    return this.inner;
  }

  get(_key) {
    return UNDEFINED_REFERENCE;
  }

}
const UNDEFINED_REFERENCE = new PrimitiveReference(undefined);

class ConstReference {
  constructor(inner) {
    this.inner = inner;
    this.tag = CONSTANT_TAG;
  }

  value() {
    return this.inner;
  }

  get(_key) {
    return UNDEFINED_REFERENCE;
  }

}

class ListItem extends ListNode {
  constructor(iterable, result) {
    super(iterable.valueReferenceFor(result));
    this.retained = false;
    this.seen = false;
    this.key = result.key;
    this.iterable = iterable;
    this.memo = iterable.memoReferenceFor(result);
  }

  update(item) {
    this.retained = true;
    this.iterable.updateValueReference(this.value, item);
    this.iterable.updateMemoReference(this.memo, item);
  }

  shouldRemove() {
    return !this.retained;
  }

  reset() {
    this.retained = false;
    this.seen = false;
  }

}
class IterationArtifacts {
  constructor(iterable) {
    this.iterator = null;
    this.map = new Map();
    this.list = new LinkedList();
    this.tag = iterable.tag;
    this.iterable = iterable;
  }

  isEmpty() {
    let iterator = this.iterator = this.iterable.iterate();
    return iterator.isEmpty();
  }

  iterate() {
    let iterator;

    if (this.iterator === null) {
      iterator = this.iterable.iterate();
    } else {
      iterator = this.iterator;
    }

    this.iterator = null;
    return iterator;
  }

  advanceToKey(key, current) {
    let seek = current;

    while (seek !== null && seek.key !== key) {
      seek = this.advanceNode(seek);
    }

    return seek;
  }

  has(key) {
    return this.map.has(key);
  }

  get(key) {
    return this.map.get(key);
  }

  wasSeen(key) {
    let node = this.map.get(key);
    return node !== undefined && node.seen;
  }

  update(item) {
    let found = this.get(item.key);
    found.update(item);
    return found;
  }

  append(item) {
    let {
      map,
      list,
      iterable
    } = this;
    let node = new ListItem(iterable, item);
    map.set(item.key, node);
    list.append(node);
    return node;
  }

  insertBefore(item, reference) {
    let {
      map,
      list,
      iterable
    } = this;
    let node = new ListItem(iterable, item);
    map.set(item.key, node);
    node.retained = true;
    list.insertBefore(node, reference);
    return node;
  }

  move(item, reference) {
    let {
      list
    } = this;
    item.retained = true;
    list.remove(item);
    list.insertBefore(item, reference);
  }

  remove(item) {
    let {
      list
    } = this;
    list.remove(item);
    this.map.delete(item.key);
  }

  nextNode(item) {
    return this.list.nextNode(item);
  }

  advanceNode(item) {
    item.seen = true;
    return this.list.nextNode(item);
  }

  head() {
    return this.list.head();
  }

}
class ReferenceIterator {
  // if anyone needs to construct this object with something other than
  // an iterable, let @wycats know.
  constructor(iterable) {
    this.iterator = null;
    let artifacts = new IterationArtifacts(iterable);
    this.artifacts = artifacts;
  }

  next() {
    let {
      artifacts
    } = this;
    let iterator = this.iterator = this.iterator || artifacts.iterate();
    let item = iterator.next();
    if (item === null) return null;
    return artifacts.append(item);
  }

}
var Phase;

(function (Phase) {
  Phase[Phase["Append"] = 0] = "Append";
  Phase[Phase["Prune"] = 1] = "Prune";
  Phase[Phase["Done"] = 2] = "Done";
})(Phase || (Phase = {}));

const END = symbol$1('END');
class IteratorSynchronizer {
  constructor({
    target,
    artifacts,
    env
  }) {
    this.target = target;
    this.artifacts = artifacts;
    this.iterator = artifacts.iterate();
    this.current = artifacts.head();
    this.env = env;
  }

  sync() {
    let phase = Phase.Append;

    while (true) {
      switch (phase) {
        case Phase.Append:
          phase = this.nextAppend();
          break;

        case Phase.Prune:
          phase = this.nextPrune();
          break;

        case Phase.Done:
          this.nextDone();
          return;
      }
    }
  }

  advanceToKey(key) {
    let {
      current,
      artifacts
    } = this;
    if (current === null) return;
    let next = artifacts.advanceNode(current);

    if (next.key === key) {
      this.current = artifacts.advanceNode(next);
      return;
    }

    let seek = artifacts.advanceToKey(key, current);

    if (seek) {
      this.move(seek, current);
      this.current = artifacts.nextNode(current);
    }
  }

  move(item, reference) {
    if (item.next !== reference) {
      this.artifacts.move(item, reference);
      this.target.move(this.env, item.key, item.value, item.memo, reference ? reference.key : END);
    }
  }

  nextAppend() {
    let {
      iterator,
      current,
      artifacts
    } = this;
    let item = iterator.next();

    if (item === null) {
      return this.startPrune();
    }

    let {
      key
    } = item;

    if (current !== null && current.key === key) {
      this.nextRetain(item, current);
    } else if (artifacts.has(key)) {
      this.nextMove(item);
    } else {
      this.nextInsert(item);
    }

    return Phase.Append;
  }

  nextRetain(item, current) {
    let {
      artifacts
    } = this; // current = expect(current, 'BUG: current is empty');

    current.update(item);
    this.current = artifacts.nextNode(current);
    this.target.retain(this.env, item.key, current.value, current.memo);
  }

  nextMove(item) {
    let {
      current,
      artifacts
    } = this;
    let {
      key
    } = item;
    let found = artifacts.update(item);

    if (artifacts.wasSeen(key)) {
      this.move(found, current);
    } else {
      this.advanceToKey(key);
    }
  }

  nextInsert(item) {
    let {
      artifacts,
      target,
      current
    } = this;
    let node = artifacts.insertBefore(item, current);
    target.insert(this.env, node.key, node.value, node.memo, current ? current.key : null);
  }

  startPrune() {
    this.current = this.artifacts.head();
    return Phase.Prune;
  }

  nextPrune() {
    let {
      artifacts,
      target,
      current
    } = this;

    if (current === null) {
      return Phase.Done;
    }

    let node = current;
    this.current = artifacts.nextNode(node);

    if (node.shouldRemove()) {
      artifacts.remove(node);
      target.delete(this.env, node.key);
    } else {
      node.reset();
    }

    return Phase.Prune;
  }

  nextDone() {
    this.target.done(this.env);
  }

}

const UPDATE_REFERENCED_VALUE = symbol$1('UPDATE_REFERENCED_VALUE');
/**
 * RootReferences refer to a constant root value within a template. For
 * instance, the `this` in `{{this.some.prop}}`. This is typically a:
 *
 * - Component
 * - Controller
 * - Helper
 *
 * Or another "top level" template construct, if you will. PropertyReferences
 * chain off a root reference in the template, and can then be passed around and
 * used at will.
 */

class RootReference {
  constructor(env) {
    this.env = env;
    this.children = dict();
    this.tag = CONSTANT_TAG;
  }

  get(key) {
    // References should in general be identical to one another, so we can usually
    // deduplicate them in production. However, in DEBUG we need unique references
    // so we can properly key off them for the logging context.
    {
      let ref = this.children[key];

      if (ref === undefined) {
        ref = this.children[key] = new PropertyReference(this, key, this.env);
      }

      return ref;
    }
  }

}
class ComponentRootReference extends RootReference {
  constructor(inner, env) {
    super(env);
    this.inner = inner;
  }

  value() {
    return this.inner;
  }

}
class HelperRootReference extends RootReference {
  constructor(fn, args, env, debugName) {
    super(env);
    this.fn = fn;
    this.args = args;
    this.computeRevision = null;
    this.computeTag = null;

    if (isConst(args)) {
      this.compute();
    }

    let {
      tag,
      computeTag
    } = this;

    if (computeTag !== null && isConstTag(computeTag)) {
      // If the args are constant, and the first computation is constant, then
      // the helper itself is constant and will never update.
      tag = this.tag = CONSTANT_TAG;
      this.computeRevision = valueForTag();
    } else {
      let valueTag = this.valueTag = createUpdatableTag();
      tag = this.tag = combine([args.tag, valueTag]);

      if (computeTag !== null) {
        // We computed once, so setup the cache state correctly
        updateTag(valueTag, computeTag);
        this.computeRevision = valueForTag();
      }
    }
  }

  compute() {
    this.computeTag = track(() => {
      this.computeValue = this.fn(this.args);
    }, DEBUG );
  }

  value() {
    let {
      tag,
      computeRevision
    } = this;

    if (computeRevision === null || !validateTag(tag, computeRevision)) {
      this.compute();
      updateTag(this.valueTag, this.computeTag);
      this.computeRevision = valueForTag();
    }

    return this.computeValue;
  }

}
/**
 * PropertyReferences represent a property that has been accessed on a root, or
 * another property (or iterable, see below). `some` and `prop` in
 * `{{this.some.prop}}` are each property references, `some` being a property of
 * `this`, and `prop` being a property of `some`. They are constructed by
 * recursively calling `get` on the previous reference as a template chain is
 * followed.
 */

class PropertyReference {
  constructor(parentReference, propertyKey, env) {
    this.parentReference = parentReference;
    this.propertyKey = propertyKey;
    this.env = env;
    this.children = dict();
    this.lastRevision = null;

    let valueTag = this.valueTag = createUpdatableTag();
    let parentReferenceTag = parentReference.tag;
    this.tag = combine([parentReferenceTag, valueTag]);
  }

  value() {
    let {
      tag,
      lastRevision,
      lastValue,
      parentReference,
      valueTag,
      propertyKey
    } = this;

    if (lastRevision === null || !validateTag(tag, lastRevision)) {
      let parentValue = parentReference.value();

      if (isDict(parentValue)) {
        let combined = track(() => {
          lastValue = this.env.getPath(parentValue, propertyKey);
        }, DEBUG );
        updateTag(valueTag, combined);
      } else {
        lastValue = undefined;
      }

      this.lastValue = lastValue;
      this.lastRevision = valueForTag();
    }

    return lastValue;
  }

  get(key) {
    // References should in general be identical to one another, so we can usually
    // deduplicate them in production. However, in DEBUG we need unique references
    // so we can properly key off them for the logging context.
    {
      let ref = this.children[key];

      if (ref === undefined) {
        ref = this.children[key] = new PropertyReference(this, key, this.env);
      }

      return ref;
    }
  }

  [UPDATE_REFERENCED_VALUE](value) {
    let {
      parentReference,
      propertyKey
    } = this;
    let parentValue = parentReference.value();
    this.env.setPath(parentValue, propertyKey, value);
  }

} //////////

/**
 * IterationItemReferences represent an individual item in an iterable `each`.
 * They are similar to PropertyReferences, but since iteration items need to be
 * updated they have slightly different behavior. Concretely, they are the
 * `item` in:
 *
 * ```hbs
 * {{#each this.items as |item|}}
 *   {{item.foo}}
 * {{/each}}
 * ```
 *
 * Properties can chain off an iteration item, just like with the other template
 * reference types.
 */

class IterationItemReference {
  constructor(parentReference, itemValue, itemKey, env) {
    this.parentReference = parentReference;
    this.itemValue = itemValue;
    this.env = env;
    this.tag = createUpdatableTag();
    this.children = dict();
  }

  value() {
    return this.itemValue;
  }

  update(value) {
    dirtyTag(this.tag);
    this.itemValue = value;
  }

  get(key) {
    // References should in general be identical to one another, so we can usually
    // deduplicate them in production. However, in DEBUG we need unique references
    // so we can properly key off them for the logging context.
    {
      let ref = this.children[key];

      if (ref === undefined) {
        ref = this.children[key] = new PropertyReference(this, key, this.env);
      }

      return ref;
    }
  }

}

const NULL_IDENTITY = {};

const KEY = (_, index) => index;

const INDEX = (_, index) => String(index);

const IDENTITY = item => {
  if (item === null) {
    // Returning null as an identity will cause failures since the iterator
    // can't tell that it's actually supposed to be null
    return NULL_IDENTITY;
  }

  return item;
};

function keyForPath(path, getPath) {

  return uniqueKeyFor(item => getPath(item, path));
}

function makeKeyFor(key, getPath) {
  switch (key) {
    case '@key':
      return uniqueKeyFor(KEY);

    case '@index':
      return uniqueKeyFor(INDEX);

    case '@identity':
      return uniqueKeyFor(IDENTITY);

    default:
      return keyForPath(key, getPath);
  }
}

class WeakMapWithPrimitives {
  get weakMap() {
    if (this._weakMap === undefined) {
      this._weakMap = new WeakMap();
    }

    return this._weakMap;
  }

  get primitiveMap() {
    if (this._primitiveMap === undefined) {
      this._primitiveMap = new Map();
    }

    return this._primitiveMap;
  }

  set(key, value) {
    if (isObject$1(key) || typeof key === 'function') {
      this.weakMap.set(key, value);
    } else {
      this.primitiveMap.set(key, value);
    }
  }

  get(key) {
    if (isObject$1(key) || typeof key === 'function') {
      return this.weakMap.get(key);
    } else {
      return this.primitiveMap.get(key);
    }
  }

}

const IDENTITIES = new WeakMapWithPrimitives();

function identityForNthOccurence(value, count) {
  let identities = IDENTITIES.get(value);

  if (identities === undefined) {
    identities = [];
    IDENTITIES.set(value, identities);
  }

  let identity = identities[count];

  if (identity === undefined) {
    identity = {
      value,
      count
    };
    identities[count] = identity;
  }

  return identity;
}
/**
 * When iterating over a list, it's possible that an item with the same unique
 * key could be encountered twice:
 *
 * ```js
 * let arr = ['same', 'different', 'same', 'same'];
 * ```
 *
 * In general, we want to treat these items as _unique within the list_. To do
 * this, we track the occurences of every item as we iterate the list, and when
 * an item occurs more than once, we generate a new unique key just for that
 * item, and that occurence within the list. The next time we iterate the list,
 * and encounter an item for the nth time, we can get the _same_ key, and let
 * Glimmer know that it should reuse the DOM for the previous nth occurence.
 */


function uniqueKeyFor(keyFor) {
  let seen = new WeakMapWithPrimitives();
  return (value, memo) => {
    let key = keyFor(value, memo);
    let count = seen.get(value) || 0;
    seen.set(key, count + 1);

    if (count === 0) {
      return key;
    }

    return identityForNthOccurence(key, count);
  };
}

class IterableImpl {
  constructor(parentRef, key, env) {
    this.parentRef = parentRef;
    this.key = key;
    this.env = env;
    this.tag = parentRef.tag;
  }

  iterate() {
    let {
      parentRef,
      key,
      env
    } = this;
    let iterable = parentRef.value();
    let keyFor = makeKeyFor(key, env.getPath);

    if (Array.isArray(iterable)) {
      return new ArrayIterator(iterable, keyFor);
    }

    let maybeIterator = env.toIterator(iterable);

    if (maybeIterator === null) {
      return new ArrayIterator(EMPTY_ARRAY, () => null);
    }

    return new IteratorWrapper(maybeIterator, keyFor);
  }

  valueReferenceFor(item) {
    let {
      parentRef,
      env
    } = this;
    return new IterationItemReference(parentRef, item.value, item.memo, env);
  }

  updateValueReference(reference, item) {
    reference.update(item.value);
  }

  memoReferenceFor(item) {
    let {
      parentRef,
      env
    } = this;
    return new IterationItemReference(parentRef, item.memo,  '', env);
  }

  updateMemoReference(reference, item) {
    reference.update(item.memo);
  }

}

class IteratorWrapper {
  constructor(inner, keyFor) {
    this.inner = inner;
    this.keyFor = keyFor;
  }

  isEmpty() {
    return this.inner.isEmpty();
  }

  next() {
    let nextValue = this.inner.next();

    if (nextValue !== null) {
      nextValue.key = this.keyFor(nextValue.value, nextValue.memo);
    }

    return nextValue;
  }

}

class ArrayIterator {
  constructor(iterator, keyFor) {
    this.iterator = iterator;
    this.keyFor = keyFor;
    this.pos = 0;

    if (iterator.length === 0) {
      this.current = {
        kind: 'empty'
      };
    } else {
      this.current = {
        kind: 'first',
        value: iterator[this.pos]
      };
    }
  }

  isEmpty() {
    return this.current.kind === 'empty';
  }

  next() {
    let value;
    let current = this.current;

    if (current.kind === 'first') {
      this.current = {
        kind: 'progress'
      };
      value = current.value;
    } else if (this.pos >= this.iterator.length - 1) {
      return null;
    } else {
      value = this.iterator[++this.pos];
    }

    let {
      keyFor
    } = this;
    let key = keyFor(value, this.pos);
    let memo = this.pos;
    return {
      key,
      value,
      memo
    };
  }

}

// http://www.w3.org/TR/html/syntax.html#html-integration-point
const SVG_INTEGRATION_POINTS = {
  foreignObject: 1,
  desc: 1,
  title: 1
}; // http://www.w3.org/TR/html/syntax.html#adjust-svg-attributes
// TODO: Adjust SVG attributes
// http://www.w3.org/TR/html/syntax.html#parsing-main-inforeign
// TODO: Adjust SVG elements
// http://www.w3.org/TR/html/syntax.html#parsing-main-inforeign

const BLACKLIST_TABLE = Object.create(null);
class DOMOperations {
  constructor(document) {
    this.document = document;
    this.setupUselessElement();
  } // split into seperate method so that NodeDOMTreeConstruction
  // can override it.


  setupUselessElement() {
    this.uselessElement = this.document.createElement('div');
  }

  createElement(tag, context) {
    let isElementInSVGNamespace, isHTMLIntegrationPoint;

    if (context) {
      isElementInSVGNamespace = context.namespaceURI === "http://www.w3.org/2000/svg"
      /* SVG */
      || tag === 'svg';
      isHTMLIntegrationPoint = !!SVG_INTEGRATION_POINTS[context.tagName];
    } else {
      isElementInSVGNamespace = tag === 'svg';
      isHTMLIntegrationPoint = false;
    }

    if (isElementInSVGNamespace && !isHTMLIntegrationPoint) {
      // FIXME: This does not properly handle <font> with color, face, or
      // size attributes, which is also disallowed by the spec. We should fix
      // this.
      if (BLACKLIST_TABLE[tag]) {
        throw new Error(`Cannot create a ${tag} inside an SVG context`);
      }

      return this.document.createElementNS("http://www.w3.org/2000/svg"
      /* SVG */
      , tag);
    } else {
      return this.document.createElement(tag);
    }
  }

  insertBefore(parent, node, reference) {
    parent.insertBefore(node, reference);
  }

  insertHTMLBefore(parent, nextSibling, html) {
    if (html === '') {
      let comment = this.createComment('');
      parent.insertBefore(comment, nextSibling);
      return new ConcreteBounds(parent, comment, comment);
    }

    let prev = nextSibling ? nextSibling.previousSibling : parent.lastChild;
    let last;

    if (nextSibling === null) {
      parent.insertAdjacentHTML("beforeend"
      /* beforeend */
      , html);
      last = parent.lastChild;
    } else if (nextSibling instanceof HTMLElement) {
      nextSibling.insertAdjacentHTML('beforebegin', html);
      last = nextSibling.previousSibling;
    } else {
      // Non-element nodes do not support insertAdjacentHTML, so add an
      // element and call it on that element. Then remove the element.
      //
      // This also protects Edge, IE and Firefox w/o the inspector open
      // from merging adjacent text nodes. See ./compat/text-node-merging-fix.ts
      let {
        uselessElement
      } = this;
      parent.insertBefore(uselessElement, nextSibling);
      uselessElement.insertAdjacentHTML("beforebegin"
      /* beforebegin */
      , html);
      last = uselessElement.previousSibling;
      parent.removeChild(uselessElement);
    }

    let first = prev ? prev.nextSibling : parent.firstChild;
    return new ConcreteBounds(parent, first, last);
  }

  createTextNode(text) {
    return this.document.createTextNode(text);
  }

  createComment(data) {
    return this.document.createComment(data);
  }

}
function moveNodesBefore(source, target, nextSibling) {
  let first = source.firstChild;
  let last = first;
  let current = first;

  while (current) {
    let next = current.nextSibling;
    target.insertBefore(current, nextSibling);
    last = current;
    current = next;
  }

  return new ConcreteBounds(target, first, last);
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
/* SVG */
; // Patch:    insertAdjacentHTML on SVG Fix
// Browsers: Safari, IE, Edge, Firefox ~33-34
// Reason:   insertAdjacentHTML does not exist on SVG elements in Safari. It is
//           present but throws an exception on IE and Edge. Old versions of
//           Firefox create nodes in the incorrect namespace.
// Fix:      Since IE and Edge silently fail to create SVG nodes using
//           innerHTML, and because Firefox may create nodes in the incorrect
//           namespace using innerHTML on SVG elements, an HTML-string wrapping
//           approach is used. A pre/post SVG tag is added to the string, then
//           that whole string is added to a div. The created nodes are plucked
//           out and applied to the target location on DOM.

function applySVGInnerHTMLFix(document, DOMClass, svgNamespace) {
  if (!document) return DOMClass;

  if (!shouldApplyFix(document, svgNamespace)) {
    return DOMClass;
  }

  let div = document.createElement('div');
  return class DOMChangesWithSVGInnerHTMLFix extends DOMClass {
    insertHTMLBefore(parent, nextSibling, html) {
      if (html === '') {
        return super.insertHTMLBefore(parent, nextSibling, html);
      }

      if (parent.namespaceURI !== svgNamespace) {
        return super.insertHTMLBefore(parent, nextSibling, html);
      }

      return fixSVG(parent, div, html, nextSibling);
    }

  };
}

function fixSVG(parent, div, html, reference) {
  let source; // This is important, because decendants of the <foreignObject> integration
  // point are parsed in the HTML namespace

  if (parent.tagName.toUpperCase() === 'FOREIGNOBJECT') {
    // IE, Edge: also do not correctly support using `innerHTML` on SVG
    // namespaced elements. So here a wrapper is used.
    let wrappedHtml = '<svg><foreignObject>' + html + '</foreignObject></svg>';
    clearElement(div);
    div.insertAdjacentHTML("afterbegin"
    /* afterbegin */
    , wrappedHtml);
    source = div.firstChild.firstChild;
  } else {
    // IE, Edge: also do not correctly support using `innerHTML` on SVG
    // namespaced elements. So here a wrapper is used.
    let wrappedHtml = '<svg>' + html + '</svg>';
    clearElement(div);
    div.insertAdjacentHTML("afterbegin"
    /* afterbegin */
    , wrappedHtml);
    source = div.firstChild;
  }

  return moveNodesBefore(source, parent, reference);
}

function shouldApplyFix(document, svgNamespace) {
  let svg = document.createElementNS(svgNamespace, 'svg');

  try {
    svg.insertAdjacentHTML("beforeend"
    /* beforeend */
    , '<circle></circle>');
  } catch (e) {// IE, Edge: Will throw, insertAdjacentHTML is unsupported on SVG
    // Safari: Will throw, insertAdjacentHTML is not present on SVG
  } finally {
    // FF: Old versions will create a node in the wrong namespace
    if (svg.childNodes.length === 1 && svg.firstChild.namespaceURI === SVG_NAMESPACE) {
      // The test worked as expected, no fix required
      return false;
    }

    return true;
  }
}

// Patch:    Adjacent text node merging fix
// Browsers: IE, Edge, Firefox w/o inspector open
// Reason:   These browsers will merge adjacent text nodes. For exmaple given
//           <div>Hello</div> with div.insertAdjacentHTML(' world') browsers
//           with proper behavior will populate div.childNodes with two items.
//           These browsers will populate it with one merged node instead.
// Fix:      Add these nodes to a wrapper element, then iterate the childNodes
//           of that wrapper and move the nodes to their target location. Note
//           that potential SVG bugs will have been handled before this fix.
//           Note that this fix must only apply to the previous text node, as
//           the base implementation of `insertHTMLBefore` already handles
//           following text nodes correctly.
function applyTextNodeMergingFix(document, DOMClass) {
  if (!document) return DOMClass;

  if (!shouldApplyFix$1(document)) {
    return DOMClass;
  }

  return class DOMChangesWithTextNodeMergingFix extends DOMClass {
    constructor(document) {
      super(document);
      this.uselessComment = document.createComment('');
    }

    insertHTMLBefore(parent, nextSibling, html) {
      if (html === '') {
        return super.insertHTMLBefore(parent, nextSibling, html);
      }

      let didSetUselessComment = false;
      let nextPrevious = nextSibling ? nextSibling.previousSibling : parent.lastChild;

      if (nextPrevious && nextPrevious instanceof Text) {
        didSetUselessComment = true;
        parent.insertBefore(this.uselessComment, nextSibling);
      }

      let bounds = super.insertHTMLBefore(parent, nextSibling, html);

      if (didSetUselessComment) {
        parent.removeChild(this.uselessComment);
      }

      return bounds;
    }

  };
}

function shouldApplyFix$1(document) {
  let mergingTextDiv = document.createElement('div');
  mergingTextDiv.appendChild(document.createTextNode('first'));
  mergingTextDiv.insertAdjacentHTML("beforeend"
  /* beforeend */
  , 'second');

  if (mergingTextDiv.childNodes.length === 2) {
    // It worked as expected, no fix required
    return false;
  }

  return true;
}

['b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i', 'img', 'li', 'listing', 'main', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's', 'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul', 'var'].forEach(tag => BLACKLIST_TABLE[tag] = 1);
let doc = typeof document === 'undefined' ? null : document;
var DOM;

(function (DOM) {
  class TreeConstruction extends DOMOperations {
    createElementNS(namespace, tag) {
      return this.document.createElementNS(namespace, tag);
    }

    setAttribute(element, name, value, namespace = null) {
      if (namespace) {
        element.setAttributeNS(namespace, name, value);
      } else {
        element.setAttribute(name, value);
      }
    }

  }

  DOM.TreeConstruction = TreeConstruction;
  let appliedTreeContruction = TreeConstruction;
  appliedTreeContruction = applyTextNodeMergingFix(doc, appliedTreeContruction);
  appliedTreeContruction = applySVGInnerHTMLFix(doc, appliedTreeContruction, "http://www.w3.org/2000/svg"
  /* SVG */
  );
  DOM.DOMTreeConstruction = appliedTreeContruction;
})(DOM || (DOM = {}));

class DOMChangesImpl extends DOMOperations {
  constructor(document) {
    super(document);
    this.document = document;
    this.namespace = null;
  }

  setAttribute(element, name, value) {
    element.setAttribute(name, value);
  }

  removeAttribute(element, name) {
    element.removeAttribute(name);
  }

  insertAfter(element, node, reference) {
    this.insertBefore(element, node, reference.nextSibling);
  }

}
let helper = DOMChangesImpl;
helper = applyTextNodeMergingFix(doc, helper);
helper = applySVGInnerHTMLFix(doc, helper, "http://www.w3.org/2000/svg"
/* SVG */
);
const DOMTreeConstruction = DOM.DOMTreeConstruction;

class PrimitiveReference$1 extends ConstReference {
  static create(value) {
    if (value === undefined) {
      return UNDEFINED_REFERENCE$1;
    } else if (value === null) {
      return NULL_REFERENCE;
    } else if (value === true) {
      return TRUE_REFERENCE;
    } else if (value === false) {
      return FALSE_REFERENCE;
    } else if (typeof value === 'number') {
      return new ValueReference(value);
    } else {
      return new StringReference(value);
    }
  }

  constructor(value) {
    super(value);
  }

  get(_key) {
    return UNDEFINED_REFERENCE$1;
  }

}

class StringReference extends PrimitiveReference$1 {
  constructor() {
    super(...arguments);
    this.lengthReference = null;
  }

  get(key) {
    if (key === 'length') {
      let {
        lengthReference
      } = this;

      if (lengthReference === null) {
        lengthReference = this.lengthReference = new ValueReference(this.inner.length);
      }

      return lengthReference;
    } else {
      return super.get(key);
    }
  }

}

class ValueReference extends PrimitiveReference$1 {
  constructor(value) {
    super(value);
  }

}

const UNDEFINED_REFERENCE$1 = new ValueReference(undefined);
const NULL_REFERENCE = new ValueReference(null);
const TRUE_REFERENCE = new ValueReference(true);
const FALSE_REFERENCE = new ValueReference(false);
class ConditionalReference {
  constructor(inner, toBool = defaultToBool) {
    this.inner = inner;
    this.toBool = toBool;
    this.tag = inner.tag;
  }

  value() {
    return this.toBool(this.inner.value());
  }

}

function defaultToBool(value) {
  return !!value;
}

function normalizeStringValue(value) {
  if (isEmpty(value)) {
    return '';
  }

  return String(value);
}
function shouldCoerce(value) {
  return isString(value) || isEmpty(value) || typeof value === 'boolean' || typeof value === 'number';
}
function isEmpty(value) {
  return value === null || value === undefined || typeof value.toString !== 'function';
}
function isSafeString(value) {
  return typeof value === 'object' && value !== null && typeof value.toHTML === 'function';
}
function isNode(value) {
  return typeof value === 'object' && value !== null && typeof value.nodeType === 'number';
}
function isFragment(value) {
  return isNode(value) && value.nodeType === 11;
}
function isString(value) {
  return typeof value === 'string';
}

/*
 * @method normalizeProperty
 * @param element {HTMLElement}
 * @param slotName {String}
 * @returns {Object} { name, type }
 */
function normalizeProperty(element, slotName) {
  let type, normalized;

  if (slotName in element) {
    normalized = slotName;
    type = 'prop';
  } else {
    let lower = slotName.toLowerCase();

    if (lower in element) {
      type = 'prop';
      normalized = lower;
    } else {
      type = 'attr';
      normalized = slotName;
    }
  }

  if (type === 'prop' && (normalized.toLowerCase() === 'style' || preferAttr(element.tagName, normalized))) {
    type = 'attr';
  }

  return {
    normalized,
    type
  };
}
// * browser bug
// * strange spec outlier

const ATTR_OVERRIDES = {
  INPUT: {
    form: true,
    // Chrome 46.0.2464.0: 'autocorrect' in document.createElement('input') === false
    // Safari 8.0.7: 'autocorrect' in document.createElement('input') === false
    // Mobile Safari (iOS 8.4 simulator): 'autocorrect' in document.createElement('input') === true
    autocorrect: true,
    // Chrome 54.0.2840.98: 'list' in document.createElement('input') === true
    // Safari 9.1.3: 'list' in document.createElement('input') === false
    list: true
  },
  // element.form is actually a legitimate readOnly property, that is to be
  // mutated, but must be mutated by setAttribute...
  SELECT: {
    form: true
  },
  OPTION: {
    form: true
  },
  TEXTAREA: {
    form: true
  },
  LABEL: {
    form: true
  },
  FIELDSET: {
    form: true
  },
  LEGEND: {
    form: true
  },
  OBJECT: {
    form: true
  },
  BUTTON: {
    form: true
  }
};

function preferAttr(tagName, propName) {
  let tag = ATTR_OVERRIDES[tagName.toUpperCase()];
  return tag && tag[propName.toLowerCase()] || false;
}

const badProtocols = ['javascript:', 'vbscript:'];
const badTags = ['A', 'BODY', 'LINK', 'IMG', 'IFRAME', 'BASE', 'FORM'];
const badTagsForDataURI = ['EMBED'];
const badAttributes = ['href', 'src', 'background', 'action'];
const badAttributesForDataURI = ['src'];

function has(array, item) {
  return array.indexOf(item) !== -1;
}

function checkURI(tagName, attribute) {
  return (tagName === null || has(badTags, tagName)) && has(badAttributes, attribute);
}

function checkDataURI(tagName, attribute) {
  if (tagName === null) return false;
  return has(badTagsForDataURI, tagName) && has(badAttributesForDataURI, attribute);
}

function requiresSanitization(tagName, attribute) {
  return checkURI(tagName, attribute) || checkDataURI(tagName, attribute);
}
function sanitizeAttributeValue(env, element, attribute, value) {
  let tagName = null;

  if (value === null || value === undefined) {
    return value;
  }

  if (isSafeString(value)) {
    return value.toHTML();
  }

  if (!element) {
    tagName = null;
  } else {
    tagName = element.tagName.toUpperCase();
  }

  let str = normalizeStringValue(value);

  if (checkURI(tagName, attribute)) {
    let protocol = env.protocolForURL(str);

    if (has(badProtocols, protocol)) {
      return `unsafe:${str}`;
    }
  }

  if (checkDataURI(tagName, attribute)) {
    return `unsafe:${str}`;
  }

  return str;
}

function dynamicAttribute(element, attr, namespace) {
  let {
    tagName,
    namespaceURI
  } = element;
  let attribute = {
    element,
    name: attr,
    namespace
  };

  if (namespaceURI === "http://www.w3.org/2000/svg"
  /* SVG */
  ) {
      return buildDynamicAttribute(tagName, attr, attribute);
    }

  let {
    type,
    normalized
  } = normalizeProperty(element, attr);

  if (type === 'attr') {
    return buildDynamicAttribute(tagName, normalized, attribute);
  } else {
    return buildDynamicProperty(tagName, normalized, attribute);
  }
}

function buildDynamicAttribute(tagName, name, attribute) {
  if (requiresSanitization(tagName, name)) {
    return new SafeDynamicAttribute(attribute);
  } else {
    return new SimpleDynamicAttribute(attribute);
  }
}

function buildDynamicProperty(tagName, name, attribute) {
  if (requiresSanitization(tagName, name)) {
    return new SafeDynamicProperty(name, attribute);
  }

  if (isUserInputValue(tagName, name)) {
    return new InputValueDynamicAttribute(name, attribute);
  }

  if (isOptionSelected(tagName, name)) {
    return new OptionSelectedDynamicAttribute(name, attribute);
  }

  return new DefaultDynamicProperty(name, attribute);
}

class DynamicAttribute {
  constructor(attribute) {
    this.attribute = attribute;
  }

}
class SimpleDynamicAttribute extends DynamicAttribute {
  set(dom, value, _env) {
    let normalizedValue = normalizeValue(value);

    if (normalizedValue !== null) {
      let {
        name,
        namespace
      } = this.attribute;

      dom.__setAttribute(name, normalizedValue, namespace);
    }
  }

  update(value, _env) {
    let normalizedValue = normalizeValue(value);
    let {
      element,
      name
    } = this.attribute;

    if (normalizedValue === null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, normalizedValue);
    }
  }

}
class DefaultDynamicProperty extends DynamicAttribute {
  constructor(normalizedName, attribute) {
    super(attribute);
    this.normalizedName = normalizedName;
  }

  set(dom, value, _env) {
    if (value !== null && value !== undefined) {
      this.value = value;

      dom.__setProperty(this.normalizedName, value);
    }
  }

  update(value, _env) {
    let {
      element
    } = this.attribute;

    if (this.value !== value) {
      element[this.normalizedName] = this.value = value;

      if (value === null || value === undefined) {
        this.removeAttribute();
      }
    }
  }

  removeAttribute() {
    // TODO this sucks but to preserve properties first and to meet current
    // semantics we must do this.
    let {
      element,
      namespace
    } = this.attribute;

    if (namespace) {
      element.removeAttributeNS(namespace, this.normalizedName);
    } else {
      element.removeAttribute(this.normalizedName);
    }
  }

}
class SafeDynamicProperty extends DefaultDynamicProperty {
  set(dom, value, env) {
    let {
      element,
      name
    } = this.attribute;
    let sanitized = sanitizeAttributeValue(env, element, name, value);
    super.set(dom, sanitized, env);
  }

  update(value, env) {
    let {
      element,
      name
    } = this.attribute;
    let sanitized = sanitizeAttributeValue(env, element, name, value);
    super.update(sanitized, env);
  }

}
class SafeDynamicAttribute extends SimpleDynamicAttribute {
  set(dom, value, env) {
    let {
      element,
      name
    } = this.attribute;
    let sanitized = sanitizeAttributeValue(env, element, name, value);
    super.set(dom, sanitized, env);
  }

  update(value, env) {
    let {
      element,
      name
    } = this.attribute;
    let sanitized = sanitizeAttributeValue(env, element, name, value);
    super.update(sanitized, env);
  }

}
class InputValueDynamicAttribute extends DefaultDynamicProperty {
  set(dom, value) {
    dom.__setProperty('value', normalizeStringValue(value));
  }

  update(value) {
    let input = this.attribute.element;
    let currentValue = input.value;
    let normalizedValue = normalizeStringValue(value);

    if (currentValue !== normalizedValue) {
      input.value = normalizedValue;
    }
  }

}
class OptionSelectedDynamicAttribute extends DefaultDynamicProperty {
  set(dom, value) {
    if (value !== null && value !== undefined && value !== false) {
      dom.__setProperty('selected', true);
    }
  }

  update(value) {
    let option = this.attribute.element;

    if (value) {
      option.selected = true;
    } else {
      option.selected = false;
    }
  }

}

function isOptionSelected(tagName, attribute) {
  return tagName === 'OPTION' && attribute === 'selected';
}

function isUserInputValue(tagName, attribute) {
  return (tagName === 'INPUT' || tagName === 'TEXTAREA') && attribute === 'value';
}

function normalizeValue(value) {
  if (value === false || value === undefined || value === null || typeof value.toString === 'undefined') {
    return null;
  }

  if (value === true) {
    return '';
  } // onclick function etc in SSR


  if (typeof value === 'function') {
    return null;
  }

  return String(value);
}

const UNRESOLVED = {};
const WELL_KNOWN_EMPTY_ARRAY_POSITION = 0;
const WELL_KNOW_EMPTY_ARRAY = Object.freeze([]);
class WriteOnlyConstants {
  constructor() {
    // `0` means NULL
    this.strings = [];
    this.arrays = [WELL_KNOW_EMPTY_ARRAY];
    this.tables = [];
    this.handles = [];
    this.resolved = [];
    this.numbers = [];
    this.others = [];
  }

  other(other) {
    return this.others.push(other) - 1;
  }

  string(value) {
    let index = this.strings.indexOf(value);

    if (index > -1) {
      return index;
    }

    return this.strings.push(value) - 1;
  }

  stringArray(strings) {
    let _strings = new Array(strings.length);

    for (let i = 0; i < strings.length; i++) {
      _strings[i] = this.string(strings[i]);
    }

    return this.array(_strings);
  }

  array(values) {
    if (values.length === 0) {
      return WELL_KNOWN_EMPTY_ARRAY_POSITION;
    }

    let index = this.arrays.indexOf(values);

    if (index > -1) {
      return index;
    }

    return this.arrays.push(values) - 1;
  }

  serializable(value) {
    let str = JSON.stringify(value);
    let index = this.strings.indexOf(str);

    if (index > -1) {
      return index;
    }

    return this.strings.push(str) - 1;
  }

  templateMeta(value) {
    return this.serializable(value);
  }

  number(number) {
    let index = this.numbers.indexOf(number);

    if (index > -1) {
      return index;
    }

    return this.numbers.push(number) - 1;
  }

  toPool() {
    return {
      strings: this.strings,
      arrays: this.arrays,
      handles: this.handles,
      numbers: this.numbers
    };
  }

}
class RuntimeConstantsImpl {
  constructor(pool) {
    this.strings = pool.strings;
    this.arrays = pool.arrays;
    this.handles = pool.handles;
    this.numbers = pool.numbers;
    this.others = [];
  }

  getString(value) {
    return this.strings[value];
  }

  getNumber(value) {
    return this.numbers[value];
  }

  getStringArray(value) {
    let names = this.getArray(value);

    let _names = new Array(names.length);

    for (let i = 0; i < names.length; i++) {
      let n = names[i];
      _names[i] = this.getString(n);
    }

    return _names;
  }

  getArray(value) {
    return this.arrays[value];
  }

  getSerializable(s) {
    return JSON.parse(this.strings[s]);
  }

  getTemplateMeta(m) {
    return this.getSerializable(m);
  }

  getOther(value) {
    return this.others[value];
  }

}
class JitConstants extends WriteOnlyConstants {
  constructor(pool) {
    super();
    this.metas = [];

    if (pool) {
      this.strings = pool.strings;
      this.arrays = pool.arrays;
      this.handles = pool.handles;
      this.resolved = this.handles.map(() => UNRESOLVED);
      this.numbers = pool.numbers;
    }

    this.others = [];
  }

  templateMeta(meta) {
    let index = this.metas.indexOf(meta);

    if (index > -1) {
      return index;
    }

    return this.metas.push(meta) - 1;
  }

  getNumber(value) {
    return this.numbers[value];
  }

  getString(value) {
    return this.strings[value];
  }

  getStringArray(value) {
    let names = this.getArray(value);

    let _names = new Array(names.length);

    for (let i = 0; i < names.length; i++) {
      let n = names[i];
      _names[i] = this.getString(n);
    }

    return _names;
  }

  getArray(value) {
    return this.arrays[value];
  }

  getSerializable(s) {
    return JSON.parse(this.strings[s]);
  }

  getTemplateMeta(m) {
    return this.metas[m];
  }

  getOther(value) {
    return this.others[value];
  }

}

class RuntimeOpImpl {
  constructor(heap) {
    this.heap = heap;
    this.offset = 0;
  }

  get size() {
    let rawType = this.heap.getbyaddr(this.offset);
    return ((rawType & 768
    /* OPERAND_LEN_MASK */
    ) >> 8
    /* ARG_SHIFT */
    ) + 1;
  }

  get isMachine() {
    let rawType = this.heap.getbyaddr(this.offset);
    return rawType & 1024
    /* MACHINE_MASK */
    ? 1 : 0;
  }

  get type() {
    return this.heap.getbyaddr(this.offset) & 255
    /* TYPE_MASK */
    ;
  }

  get op1() {
    return this.heap.getbyaddr(this.offset + 1);
  }

  get op2() {
    return this.heap.getbyaddr(this.offset + 2);
  }

  get op3() {
    return this.heap.getbyaddr(this.offset + 3);
  }

}

function encodeTableInfo(scopeSize, state) {
  return state | scopeSize << 2;
}

function changeState(info, newState) {
  return info | newState << 30;
}

const PAGE_SIZE = 0x100000;
class RuntimeHeapImpl {
  constructor(serializedHeap) {
    let {
      buffer,
      table
    } = serializedHeap;
    this.heap = new Int32Array(buffer);
    this.table = table;
  } // It is illegal to close over this address, as compaction
  // may move it. However, it is legal to use this address
  // multiple times between compactions.


  getaddr(handle) {
    return this.table[handle];
  }

  getbyaddr(address) {
    return this.heap[address];
  }

  sizeof(handle) {
    return sizeof(this.table);
  }

  scopesizeof(handle) {
    return scopesizeof(this.table, handle);
  }

}
/**
 * The Heap is responsible for dynamically allocating
 * memory in which we read/write the VM's instructions
 * from/to. When we malloc we pass out a VMHandle, which
 * is used as an indirect way of accessing the memory during
 * execution of the VM. Internally we track the different
 * regions of the memory in an int array known as the table.
 *
 * The table 32-bit aligned and has the following layout:
 *
 * | ... | hp (u32) |       info (u32)   | size (u32) |
 * | ... |  Handle  | Scope Size | State | Size       |
 * | ... | 32bits   | 30bits     | 2bits | 32bit      |
 *
 * With this information we effectively have the ability to
 * control when we want to free memory. That being said you
 * can not free during execution as raw address are only
 * valid during the execution. This means you cannot close
 * over them as you will have a bad memory access exception.
 */

class HeapImpl {
  constructor() {
    this.placeholders = [];
    this.stdlibs = [];
    this.offset = 0;
    this.handle = 0;
    this.capacity = PAGE_SIZE;
    this.heap = new Int32Array(PAGE_SIZE);
    this.table = [];
  }

  push(item) {
    this.sizeCheck();
    this.heap[this.offset++] = item;
  }

  sizeCheck() {
    if (this.capacity === 0) {
      let heap = slice(this.heap, 0, this.offset);
      this.heap = new Int32Array(heap.length + PAGE_SIZE);
      this.heap.set(heap, 0);
      this.capacity = PAGE_SIZE;
    }

    this.capacity--;
  }

  getbyaddr(address) {
    return this.heap[address];
  }

  setbyaddr(address, value) {
    this.heap[address] = value;
  }

  malloc() {
    // push offset, info, size
    this.table.push(this.offset, 0, 0);
    let handle = this.handle;
    this.handle += 3
    /* ENTRY_SIZE */
    ;
    return handle;
  }

  finishMalloc(handle, scopeSize) {

    this.table[handle + 1
    /* INFO_OFFSET */
    ] = encodeTableInfo(scopeSize, 0
    /* Allocated */
    );
  }

  size() {
    return this.offset;
  } // It is illegal to close over this address, as compaction
  // may move it. However, it is legal to use this address
  // multiple times between compactions.


  getaddr(handle) {
    return this.table[handle];
  }

  gethandle(address) {
    this.table.push(address, encodeTableInfo(0, 3
    /* Pointer */
    ), 0);
    let handle = this.handle;
    this.handle += 3
    /* ENTRY_SIZE */
    ;
    return handle;
  }

  sizeof(handle) {
    return sizeof(this.table);
  }

  scopesizeof(handle) {
    return scopesizeof(this.table, handle);
  }

  free(handle) {
    let info = this.table[handle + 1
    /* INFO_OFFSET */
    ];
    this.table[handle + 1
    /* INFO_OFFSET */
    ] = changeState(info, 1
    /* Freed */
    );
  }
  /**
   * The heap uses the [Mark-Compact Algorithm](https://en.wikipedia.org/wiki/Mark-compact_algorithm) to shift
   * reachable memory to the bottom of the heap and freeable
   * memory to the top of the heap. When we have shifted all
   * the reachable memory to the top of the heap, we move the
   * offset to the next free position.
   */


  compact() {
    let compactedSize = 0;
    let {
      table,
      table: {
        length
      },
      heap
    } = this;

    for (let i = 0; i < length; i += 3
    /* ENTRY_SIZE */
    ) {
      let offset = table[i];
      let info = table[i + 1
      /* INFO_OFFSET */
      ]; // @ts-ignore (this whole function is currently unused)

      let size = info & Size.SIZE_MASK;
      let state = info & 3
      /* STATE_MASK */
      >> 30;

      if (state === 2
      /* Purged */
      ) {
          continue;
        } else if (state === 1
      /* Freed */
      ) {
          // transition to "already freed" aka "purged"
          // a good improvement would be to reuse
          // these slots
          table[i + 1
          /* INFO_OFFSET */
          ] = changeState(info, 2
          /* Purged */
          );
          compactedSize += size;
        } else if (state === 0
      /* Allocated */
      ) {
          for (let j = offset; j <= i + size; j++) {
            heap[j - compactedSize] = heap[j];
          }

          table[i] = offset - compactedSize;
        } else if (state === 3
      /* Pointer */
      ) {
          table[i] = offset - compactedSize;
        }
    }

    this.offset = this.offset - compactedSize;
  }

  pushPlaceholder(valueFunc) {
    this.sizeCheck();
    let address = this.offset++;
    this.heap[address] = 2147483647
    /* MAX_SIZE */
    ;
    this.placeholders.push([address, valueFunc]);
  }

  pushStdlib(operand) {
    this.sizeCheck();
    let address = this.offset++;
    this.heap[address] = 2147483647
    /* MAX_SIZE */
    ;
    this.stdlibs.push([address, operand]);
  }

  patchPlaceholders() {
    let {
      placeholders
    } = this;

    for (let i = 0; i < placeholders.length; i++) {
      let [address, getValue] = placeholders[i];
      this.setbyaddr(address, getValue());
    }
  }

  patchStdlibs(stdlib) {
    let {
      stdlibs
    } = this;

    for (let i = 0; i < stdlibs.length; i++) {
      let [address, {
        value
      }] = stdlibs[i];
      this.setbyaddr(address, stdlib[value]);
    }

    this.stdlibs = [];
  }

  capture(stdlib, offset = this.offset) {
    this.patchPlaceholders();
    this.patchStdlibs(stdlib); // Only called in eager mode

    let buffer = slice(this.heap, 0, offset).buffer;
    return {
      handle: this.handle,
      table: this.table,
      buffer: buffer
    };
  }

}
class RuntimeProgramImpl {
  constructor(constants, heap) {
    this.constants = constants;
    this.heap = heap;
    this._opcode = new RuntimeOpImpl(this.heap);
  }

  static hydrate(artifacts) {
    let heap = new RuntimeHeapImpl(artifacts.heap);
    let constants = new RuntimeConstantsImpl(artifacts.constants);
    return new RuntimeProgramImpl(constants, heap);
  }

  opcode(offset) {
    this._opcode.offset = offset;
    return this._opcode;
  }

}

function slice(arr, start, end) {
  if (arr.slice !== undefined) {
    return arr.slice(start, end);
  }

  let ret = new Int32Array(end);

  for (; start < end; start++) {
    ret[start] = arr[start];
  }

  return ret;
}

function sizeof(table, handle) {
  {
    return -1;
  }
}

function scopesizeof(table, handle) {
  let info = table[handle + 1
  /* INFO_OFFSET */
  ];
  return info >> 2;
}

function patchStdlibs(program) {
  program.heap.patchStdlibs(program.stdlib);
}

var _a$1;
class ScopeImpl {
  constructor( // the 0th slot is `self`
  slots, callerScope, // named arguments and blocks passed to a layout that uses eval
  evalScope, // locals in scope when the partial was invoked
  partialMap) {
    this.slots = slots;
    this.callerScope = callerScope;
    this.evalScope = evalScope;
    this.partialMap = partialMap;
  }

  static root(self, size = 0) {
    let refs = new Array(size + 1);

    for (let i = 0; i <= size; i++) {
      refs[i] = UNDEFINED_REFERENCE$1;
    }

    return new ScopeImpl(refs, null, null, null).init({
      self
    });
  }

  static sized(size = 0) {
    let refs = new Array(size + 1);

    for (let i = 0; i <= size; i++) {
      refs[i] = UNDEFINED_REFERENCE$1;
    }

    return new ScopeImpl(refs, null, null, null);
  }

  init({
    self
  }) {
    this.slots[0] = self;
    return this;
  }

  getSelf() {
    return this.get(0);
  }

  getSymbol(symbol) {
    return this.get(symbol);
  }

  getBlock(symbol) {
    let block = this.get(symbol);
    return block === UNDEFINED_REFERENCE$1 ? null : block;
  }

  getEvalScope() {
    return this.evalScope;
  }

  getPartialMap() {
    return this.partialMap;
  }

  bind(symbol, value) {
    this.set(symbol, value);
  }

  bindSelf(self) {
    this.set(0, self);
  }

  bindSymbol(symbol, value) {
    this.set(symbol, value);
  }

  bindBlock(symbol, value) {
    this.set(symbol, value);
  }

  bindEvalScope(map) {
    this.evalScope = map;
  }

  bindPartialMap(map) {
    this.partialMap = map;
  }

  bindCallerScope(scope) {
    this.callerScope = scope;
  }

  getCallerScope() {
    return this.callerScope;
  }

  child() {
    return new ScopeImpl(this.slots.slice(), this.callerScope, this.evalScope, this.partialMap);
  }

  get(index) {
    if (index >= this.slots.length) {
      throw new RangeError(`BUG: cannot get $${index} from scope; length=${this.slots.length}`);
    }

    return this.slots[index];
  }

  set(index, value) {
    if (index >= this.slots.length) {
      throw new RangeError(`BUG: cannot get $${index} from scope; length=${this.slots.length}`);
    }

    this.slots[index] = value;
  }

}
const TRANSACTION = symbol$1('TRANSACTION');

class TransactionImpl {
  constructor() {
    this.scheduledInstallManagers = [];
    this.scheduledInstallModifiers = [];
    this.scheduledUpdateModifierManagers = [];
    this.scheduledUpdateModifiers = [];
    this.createdComponents = [];
    this.createdManagers = [];
    this.updatedComponents = [];
    this.updatedManagers = [];
    this.destructors = [];
  }

  didCreate(component, manager) {
    this.createdComponents.push(component);
    this.createdManagers.push(manager);
  }

  didUpdate(component, manager) {
    this.updatedComponents.push(component);
    this.updatedManagers.push(manager);
  }

  scheduleInstallModifier(modifier, manager) {
    this.scheduledInstallModifiers.push(modifier);
    this.scheduledInstallManagers.push(manager);
  }

  scheduleUpdateModifier(modifier, manager) {
    this.scheduledUpdateModifiers.push(modifier);
    this.scheduledUpdateModifierManagers.push(manager);
  }

  willDestroy(d) {
    d[WILL_DROP]();
  }

  didDestroy(d) {
    this.destructors.push(d);
  }

  commit() {
    let {
      createdComponents,
      createdManagers
    } = this;

    for (let i = 0; i < createdComponents.length; i++) {
      let component = createdComponents[i];
      let manager = createdManagers[i];
      manager.didCreate(component);
    }

    let {
      updatedComponents,
      updatedManagers
    } = this;

    for (let i = 0; i < updatedComponents.length; i++) {
      let component = updatedComponents[i];
      let manager = updatedManagers[i];
      manager.didUpdate(component);
    }

    let {
      destructors
    } = this;

    for (let i = 0; i < destructors.length; i++) {
      destructors[i][DID_DROP]();
    }

    let {
      scheduledInstallManagers,
      scheduledInstallModifiers
    } = this;

    for (let i = 0; i < scheduledInstallManagers.length; i++) {
      let modifier = scheduledInstallModifiers[i];
      let manager = scheduledInstallManagers[i];
      manager.install(modifier);
    }

    let {
      scheduledUpdateModifierManagers,
      scheduledUpdateModifiers
    } = this;

    for (let i = 0; i < scheduledUpdateModifierManagers.length; i++) {
      let modifier = scheduledUpdateModifiers[i];
      let manager = scheduledUpdateModifierManagers[i];
      manager.update(modifier);
    }
  }

}

function defaultDelegateFn(delegateFn, delegateDefault) {
  let defaultFn = delegateFn !== undefined ? delegateFn : delegateDefault;

  return defaultFn;
}

class EnvironmentImpl {
  constructor(options, delegate) {
    this.delegate = delegate;
    this[_a$1] = null; // Delegate methods and values

    this.extra = this.delegate.extra;
    this.isInteractive = typeof this.delegate.isInteractive === 'boolean' ? this.delegate.isInteractive : true;
    this.protocolForURL = defaultDelegateFn(this.delegate.protocolForURL, defaultGetProtocolForURL);
    this.attributeFor = defaultDelegateFn(this.delegate.attributeFor, defaultAttributeFor);
    this.getPath = defaultDelegateFn(this.delegate.getPath, defaultGetPath);
    this.setPath = defaultDelegateFn(this.delegate.setPath, defaultSetPath);
    this.toBool = defaultDelegateFn(this.delegate.toBool, defaultToBool$1);
    this.toIterator = defaultDelegateFn(this.delegate.toIterator, defaultToIterator);

    if (options.appendOperations) {
      this.appendOperations = options.appendOperations;
      this.updateOperations = options.updateOperations;
    } else if (options.document) {
      this.appendOperations = new DOMTreeConstruction(options.document);
      this.updateOperations = new DOMChangesImpl(options.document);
    } else ;
  }

  getTemplatePathDebugContext(ref) {
    if (this.delegate.getTemplatePathDebugContext !== undefined) {
      return this.delegate.getTemplatePathDebugContext(ref);
    }

    return '';
  }

  setTemplatePathDebugContext(ref, desc, parentRef) {
    if (this.delegate.setTemplatePathDebugContext !== undefined) {
      this.delegate.setTemplatePathDebugContext(ref, desc, parentRef);
    }
  }

  iterableFor(ref, inputKey) {
    // TODO: We should add an assertion here to verify that we are passed a
    // TemplatePathReference, but we can only do that once we remove
    // or significantly rewrite @glimmer/object-reference
    let key = inputKey === null ? '@identity' : String(inputKey);
    return new IterableImpl(ref, key, this);
  }

  toConditionalReference(input) {
    return new ConditionalReference(input, this.delegate.toBool);
  }

  getAppendOperations() {
    return this.appendOperations;
  }

  getDOM() {
    return this.updateOperations;
  }

  begin() {

    if (this.delegate.onTransactionBegin !== undefined) {
      this.delegate.onTransactionBegin();
    }

    this[TRANSACTION] = new TransactionImpl();
  }

  get transaction() {
    return this[TRANSACTION];
  }

  didCreate(component, manager) {
    this.transaction.didCreate(component, manager);
  }

  didUpdate(component, manager) {
    this.transaction.didUpdate(component, manager);
  }

  scheduleInstallModifier(modifier, manager) {
    if (this.isInteractive) {
      this.transaction.scheduleInstallModifier(modifier, manager);
    }
  }

  scheduleUpdateModifier(modifier, manager) {
    if (this.isInteractive) {
      this.transaction.scheduleUpdateModifier(modifier, manager);
    }
  }

  willDestroy(d) {
    this.transaction.willDestroy(d);
  }

  didDestroy(d) {
    this.transaction.didDestroy(d);
  }

  commit() {
    let transaction = this.transaction;
    this[TRANSACTION] = null;
    transaction.commit();

    if (this.delegate.onTransactionCommit !== undefined) {
      this.delegate.onTransactionCommit();
    }
  }

}
_a$1 = TRANSACTION;

function defaultGetProtocolForURL(url) {
  if (typeof URL === 'object' || typeof URL === 'undefined') {
    return legacyProtocolForURL(url);
  } else if (typeof document !== 'undefined') {
    return new URL(url, document.baseURI).protocol;
  } else {
    return new URL(url, 'https://www.example.com').protocol;
  }
}

function defaultAttributeFor(element, attr, _isTrusting, namespace) {
  return dynamicAttribute(element, attr, namespace);
}

function defaultGetPath(obj, key) {
  return obj[key];
}

function defaultSetPath(obj, key, value) {
  return obj[key] = value;
}

function defaultToBool$1(value) {
  return Boolean(value);
}

function defaultToIterator(value) {
  if (value && value[Symbol.iterator]) {
    return value[Symbol.iterator]();
  }

  return null;
}

function legacyProtocolForURL(url) {
  if (typeof window === 'undefined') {
    let match = /^([a-z][a-z0-9.+-]*:)?(\/\/)?([\S\s]*)/i.exec(url);
    return match && match[1] ? match[1].toLowerCase() : '';
  }

  let anchor = window.document.createElement('a');
  anchor.href = url;
  return anchor.protocol;
}

class DefaultRuntimeResolver {
  constructor(inner) {
    this.inner = inner;
  }

  lookupComponent(name, referrer) {
    if (this.inner.lookupComponent) {
      let component = this.inner.lookupComponent(name, referrer);

      if (component === undefined) {
        throw new Error(`Unexpected component ${name} (from ${referrer}) (lookupComponent returned undefined)`);
      }

      return component;
    } else {
      throw new Error('lookupComponent not implemented on RuntimeResolver.');
    }
  }

  lookupPartial(name, referrer) {
    if (this.inner.lookupPartial) {
      let partial = this.inner.lookupPartial(name, referrer);

      if (partial === undefined) {
        throw new Error(`Unexpected partial ${name} (from ${referrer}) (lookupPartial returned undefined)`);
      }

      return partial;
    } else {
      throw new Error('lookupPartial not implemented on RuntimeResolver.');
    }
  }

  resolve(handle) {
    if (this.inner.resolve) {
      let resolved = this.inner.resolve(handle);

      if (resolved === undefined) {
        throw new Error(`Unexpected handle ${handle} (resolve returned undefined)`);
      }

      return resolved;
    } else {
      throw new Error('resolve not implemented on RuntimeResolver.');
    }
  }

  compilable(locator) {
    if (this.inner.compilable) {
      let resolved = this.inner.compilable(locator);

      if (resolved === undefined) {
        throw new Error(`Unable to compile ${name} (compilable returned undefined)`);
      }

      return resolved;
    } else {
      throw new Error('compilable not implemented on RuntimeResolver.');
    }
  }

  getInvocation(locator) {
    if (this.inner.getInvocation) {
      let invocation = this.inner.getInvocation(locator);

      if (invocation === undefined) {
        throw new Error(`Unable to get invocation for ${JSON.stringify(locator)} (getInvocation returned undefined)`);
      }

      return invocation;
    } else {
      throw new Error('getInvocation not implemented on RuntimeResolver.');
    }
  }

}
function JitRuntime(options, delegate = {}, context, resolver = {}) {
  return {
    env: new EnvironmentImpl(options, delegate),
    program: new RuntimeProgramImpl(context.program.constants, context.program.heap),
    resolver: new DefaultRuntimeResolver(resolver)
  };
}
function inTransaction(env, cb) {
  if (!env[TRANSACTION]) {
    env.begin();

    try {
      cb();
    } finally {
      env.commit();
    }
  } else {
    cb();
  }
}

class AppendOpcodes {
  constructor() {
    this.evaluateOpcode = fillNulls(107
    /* Size */
    ).slice();
  }

  add(name, evaluate, kind = 'syscall') {
    this.evaluateOpcode[name] = {
      syscall: kind !== 'machine',
      evaluate
    };
  }

  debugBefore(vm, opcode) {
    let params = undefined;
    let opName = undefined;

    let sp;

    return {
      sp: sp,
      pc: vm.fetchValue($pc),
      name: opName,
      params,
      type: opcode.type,
      isMachine: opcode.isMachine,
      size: opcode.size,
      state: undefined
    };
  }

  debugAfter(vm, pre) {
  }

  evaluate(vm, opcode, type) {
    let operation = this.evaluateOpcode[type];

    if (operation.syscall) {
      operation.evaluate(vm, opcode);
    } else {
      operation.evaluate(vm[INNER_VM], opcode);
    }
  }

}
const APPEND_OPCODES = new AppendOpcodes();
class AbstractOpcode {
  constructor() {
    initializeGuid(this);
  }

}
class UpdatingOpcode extends AbstractOpcode {
  constructor() {
    super(...arguments);
    this.next = null;
    this.prev = null;
  }

}

/**
 * These utility functions are related to @glimmer/validator, but they aren't
 * meant to be consumed publicly. They exist as an optimization, and pull in
 * types that are otherwise unrelated to the validation system. Keeping them
 * here keeps the validation system isolated, and allows it to avoid pulling in
 * extra type information (which can lead to issues in public types).
 */

function combineTagged(tagged) {
  let optimized = [];

  for (let i = 0, l = tagged.length; i < l; i++) {
    let tag = tagged[i].tag;
    if (tag === CONSTANT_TAG) continue;
    optimized.push(tag);
  }

  return createCombinatorTag(optimized);
}
function combineSlice(slice) {
  let optimized = [];
  let node = slice.head();

  while (node !== null) {
    let tag = node.tag;
    if (tag !== CONSTANT_TAG) optimized.push(tag);
    node = slice.nextNode(node);
  }

  return createCombinatorTag(optimized);
}

class ConcatReference extends CachedReference {
  constructor(parts) {
    super();
    this.parts = parts;
    this.tag = combineTagged(parts);
  }

  compute() {
    let parts = new Array();

    for (let i = 0; i < this.parts.length; i++) {
      let value = this.parts[i].value();

      if (value !== null && value !== undefined) {
        parts[i] = castToString(value);
      }
    }

    if (parts.length > 0) {
      return parts.join('');
    }

    return null;
  }

}

function castToString(value) {
  if (typeof value.toString !== 'function') {
    return '';
  }

  return String(value);
}

APPEND_OPCODES.add(16
/* Helper */
, (vm, {
  op1: handle
}) => {
  let stack = vm.stack;
  let helper = vm.runtime.resolver.resolve(handle);
  let args = stack.pop();
  let value = helper(args, vm);
  vm.loadValue($v0, value);
});
APPEND_OPCODES.add(22
/* GetVariable */
, (vm, {
  op1: symbol
}) => {
  let expr = vm.referenceForSymbol(symbol);
  vm.stack.push(expr);
});
APPEND_OPCODES.add(19
/* SetVariable */
, (vm, {
  op1: symbol
}) => {
  let expr = vm.stack.pop();
  vm.scope().bindSymbol(symbol, expr);
});
APPEND_OPCODES.add(21
/* SetJitBlock */
, (vm, {
  op1: symbol
}) => {
  let handle = vm.stack.pop();
  let scope = vm.stack.pop();
  let table = vm.stack.pop();
  let block = table ? [handle, scope, table] : null;
  vm.scope().bindBlock(symbol, block);
}, 'jit');
APPEND_OPCODES.add(20
/* SetAotBlock */
, (vm, {
  op1: symbol
}) => {
  let handle = vm.stack.pop();
  let scope = vm.stack.pop();
  let table = vm.stack.pop();
  let block = table ? [handle, scope, table] : null;
  vm.scope().bindBlock(symbol, block);
});
APPEND_OPCODES.add(105
/* ResolveMaybeLocal */
, (vm, {
  op1: _name
}) => {
  let name = vm[CONSTANTS].getString(_name);
  let locals = vm.scope().getPartialMap();
  let ref = locals[name];

  if (ref === undefined) {
    ref = vm.getSelf().get(name);
  }

  vm.stack.push(ref);
});
APPEND_OPCODES.add(37
/* RootScope */
, (vm, {
  op1: symbols
}) => {
  vm.pushRootScope(symbols);
});
APPEND_OPCODES.add(23
/* GetProperty */
, (vm, {
  op1: _key
}) => {
  let key = vm[CONSTANTS].getString(_key);
  let expr = vm.stack.pop();
  vm.stack.push(expr.get(key));
});
APPEND_OPCODES.add(24
/* GetBlock */
, (vm, {
  op1: _block
}) => {
  let {
    stack
  } = vm;
  let block = vm.scope().getBlock(_block);
  stack.push(block);
});
APPEND_OPCODES.add(25
/* JitSpreadBlock */
, vm => {
  let {
    stack
  } = vm;
  let block = stack.pop();

  if (block && !isUndefinedReference(block)) {
    stack.push(block[2]);
    stack.push(block[1]);
    stack.push(block[0]);
  } else {
    stack.push(null);
    stack.push(null);
    stack.push(null);
  }
});

function isUndefinedReference(input) {
  return input === UNDEFINED_REFERENCE$1;
}

APPEND_OPCODES.add(26
/* HasBlock */
, vm => {
  let {
    stack
  } = vm;
  let block = stack.pop();

  if (block && !isUndefinedReference(block)) {
    stack.push(TRUE_REFERENCE);
  } else {
    stack.push(FALSE_REFERENCE);
  }
});
APPEND_OPCODES.add(27
/* HasBlockParams */
, vm => {
  // FIXME(mmun): should only need to push the symbol table
  let block = vm.stack.pop();
  let scope = vm.stack.pop();
  let table = vm.stack.pop();
  let hasBlockParams = table && table.parameters.length;
  vm.stack.push(hasBlockParams ? TRUE_REFERENCE : FALSE_REFERENCE);
});
APPEND_OPCODES.add(28
/* Concat */
, (vm, {
  op1: count
}) => {
  let out = new Array(count);

  for (let i = count; i > 0; i--) {
    let offset = i - 1;
    out[offset] = vm.stack.pop();
  }

  vm.stack.push(new ConcatReference(out));
});

/**
 * Converts a ComponentCapabilities object into a 32-bit integer representation.
 */
function capabilityFlagsFrom(capabilities) {
  return 0 | (capabilities.dynamicLayout ? 1
  /* DynamicLayout */
  : 0) | (capabilities.dynamicTag ? 2
  /* DynamicTag */
  : 0) | (capabilities.prepareArgs ? 4
  /* PrepareArgs */
  : 0) | (capabilities.createArgs ? 8
  /* CreateArgs */
  : 0) | (capabilities.attributeHook ? 16
  /* AttributeHook */
  : 0) | (capabilities.elementHook ? 32
  /* ElementHook */
  : 0) | (capabilities.dynamicScope ? 64
  /* DynamicScope */
  : 0) | (capabilities.createCaller ? 128
  /* CreateCaller */
  : 0) | (capabilities.updateHook ? 256
  /* UpdateHook */
  : 0) | (capabilities.createInstance ? 512
  /* CreateInstance */
  : 0) | (capabilities.wrapped ? 1024
  /* Wrapped */
  : 0) | (capabilities.willDestroy ? 2048
  /* WillDestroy */
  : 0);
}
function managerHasCapability(_manager, capabilities, capability) {
  return !!(capabilities & capability);
}
function hasCapability(capabilities, capability) {
  return !!(capabilities & capability);
}

var _a$2;
const CURRIED_COMPONENT_DEFINITION_BRAND = symbol$1('CURRIED COMPONENT DEFINITION');
function isCurriedComponentDefinition(definition) {
  return !!(definition && definition[CURRIED_COMPONENT_DEFINITION_BRAND]);
}
function isComponentDefinition(definition) {
  return !!(definition && definition[CURRIED_COMPONENT_DEFINITION_BRAND]);
}
class CurriedComponentDefinition {
  /** @internal */
  constructor(inner, args) {
    this.inner = inner;
    this.args = args;
    this[_a$2] = true;
  }

  unwrap(args) {
    args.realloc(this.offset);
    let definition = this;

    while (true) {
      let {
        args: curriedArgs,
        inner
      } = definition;

      if (curriedArgs) {
        args.positional.prepend(curriedArgs.positional);
        args.named.merge(curriedArgs.named);
      }

      if (!isCurriedComponentDefinition(inner)) {
        return inner;
      }

      definition = inner;
    }
  }
  /** @internal */


  get offset() {
    let {
      inner,
      args
    } = this;
    let length = args ? args.positional.length : 0;
    return isCurriedComponentDefinition(inner) ? length + inner.offset : length;
  }

}
_a$2 = CURRIED_COMPONENT_DEFINITION_BRAND;

function resolveComponent(resolver, name, meta) {
  let definition = resolver.lookupComponent(name, meta);
  return definition;
}

class ClassListReference {
  constructor(list) {
    this.list = list;
    this.tag = combineTagged(list);
    this.list = list;
  }

  value() {
    let ret = [];
    let {
      list
    } = this;

    for (let i = 0; i < list.length; i++) {
      let value = normalizeStringValue(list[i].value());
      if (value) ret.push(value);
    }

    return ret.length === 0 ? null : ret.join(' ');
  }

}

class CurryComponentReference {
  constructor(inner, resolver, meta, args) {
    this.inner = inner;
    this.resolver = resolver;
    this.meta = meta;
    this.args = args;
    this.tag = inner.tag;
    this.lastValue = null;
    this.lastDefinition = null;
  }

  value() {
    let {
      inner,
      lastValue
    } = this;
    let value = inner.value();

    if (value === lastValue) {
      return this.lastDefinition;
    }

    let definition = null;

    if (isCurriedComponentDefinition(value)) {
      definition = value;
    } else if (typeof value === 'string' && value) {
      let {
        resolver,
        meta
      } = this;
      definition = resolveComponent(resolver, value, meta);
    }

    definition = this.curry(definition);
    this.lastValue = value;
    this.lastDefinition = definition;
    return definition;
  }

  get() {
    return UNDEFINED_REFERENCE$1;
  }

  curry(definition) {
    let {
      args
    } = this;

    if (!args && isCurriedComponentDefinition(definition)) {
      return definition;
    } else if (!definition) {
      return null;
    } else {
      return new CurriedComponentDefinition(definition, args);
    }
  }

}

class DynamicTextContent extends UpdatingOpcode {
  constructor(node, reference, lastValue) {
    super();
    this.node = node;
    this.reference = reference;
    this.lastValue = lastValue;
    this.type = 'dynamic-text';
    this.tag = reference.tag;
    this.lastRevision = valueForTag(this.tag);
  }

  evaluate() {
    let {
      reference,
      tag
    } = this;

    if (!validateTag(tag, this.lastRevision)) {
      this.lastRevision = valueForTag();
      this.update(reference.value());
    }
  }

  update(value) {
    let {
      lastValue
    } = this;
    if (value === lastValue) return;
    let normalized;

    if (isEmpty(value)) {
      normalized = '';
    } else if (isString(value)) {
      normalized = value;
    } else {
      normalized = String(value);
    }

    if (normalized !== lastValue) {
      let textNode = this.node;
      textNode.nodeValue = this.lastValue = normalized;
    }
  }

}

class ContentTypeReference {
  constructor(inner) {
    this.inner = inner;
    this.tag = inner.tag;
  }

  value() {
    let value = this.inner.value();

    if (shouldCoerce(value)) {
      return 1
      /* String */
      ;
    } else if (isComponentDefinition(value)) {
      return 0
      /* Component */
      ;
    } else if (isSafeString(value)) {
      return 3
      /* SafeString */
      ;
    } else if (isFragment(value)) {
      return 4
      /* Fragment */
      ;
    } else if (isNode(value)) {
      return 5
      /* Node */
      ;
    } else {
        return 1
        /* String */
        ;
      }
  }

}
APPEND_OPCODES.add(43
/* AppendHTML */
, vm => {
  let reference = vm.stack.pop();
  let rawValue = reference.value();
  let value = isEmpty(rawValue) ? '' : String(rawValue);
  vm.elements().appendDynamicHTML(value);
});
APPEND_OPCODES.add(44
/* AppendSafeHTML */
, vm => {
  let reference = vm.stack.pop();
  let rawValue = reference.value().toHTML();
  let value = isEmpty(rawValue) ? '' : rawValue;
  vm.elements().appendDynamicHTML(value);
});
APPEND_OPCODES.add(47
/* AppendText */
, vm => {
  let reference = vm.stack.pop();
  let rawValue = reference.value();
  let value = isEmpty(rawValue) ? '' : String(rawValue);
  let node = vm.elements().appendDynamicText(value);

  if (!isConst(reference)) {
    vm.updateWith(new DynamicTextContent(node, reference, value));
  }
});
APPEND_OPCODES.add(45
/* AppendDocumentFragment */
, vm => {
  let reference = vm.stack.pop();
  let value = reference.value();
  vm.elements().appendDynamicFragment(value);
});
APPEND_OPCODES.add(46
/* AppendNode */
, vm => {
  let reference = vm.stack.pop();
  let value = reference.value();
  vm.elements().appendDynamicNode(value);
});

APPEND_OPCODES.add(39
/* ChildScope */
, vm => vm.pushChildScope());
APPEND_OPCODES.add(40
/* PopScope */
, vm => vm.popScope());
APPEND_OPCODES.add(59
/* PushDynamicScope */
, vm => vm.pushDynamicScope());
APPEND_OPCODES.add(60
/* PopDynamicScope */
, vm => vm.popDynamicScope());
APPEND_OPCODES.add(29
/* Constant */
, (vm, {
  op1: other
}) => {
  vm.stack.push(vm[CONSTANTS].getOther(other));
});
APPEND_OPCODES.add(30
/* Primitive */
, (vm, {
  op1: primitive
}) => {
  let stack = vm.stack;

  if (isHandle(primitive)) {
    let value;

    if (primitive > -1073741825
    /* NUMBER_MAX_HANDLE */
    ) {
        value = vm[CONSTANTS].getString(decodeHandle(primitive, -1
        /* STRING_MAX_HANDLE */
        ));
      } else {
      value = vm[CONSTANTS].getNumber(decodeHandle(primitive, -1073741825
      /* NUMBER_MAX_HANDLE */
      ));
    }

    stack.pushJs(value);
  } else {
    // is already an encoded immediate
    stack.pushRaw(primitive);
  }
});
APPEND_OPCODES.add(31
/* PrimitiveReference */
, vm => {
  let stack = vm.stack;
  stack.push(PrimitiveReference$1.create(stack.pop()));
});
APPEND_OPCODES.add(32
/* ReifyU32 */
, vm => {
  let stack = vm.stack;
  stack.push(stack.peek().value());
});
APPEND_OPCODES.add(33
/* Dup */
, (vm, {
  op1: register,
  op2: offset
}) => {
  let position = vm.fetchValue(register) - offset;
  vm.stack.dup(position);
});
APPEND_OPCODES.add(34
/* Pop */
, (vm, {
  op1: count
}) => {
  vm.stack.pop(count);
});
APPEND_OPCODES.add(35
/* Load */
, (vm, {
  op1: register
}) => {
  vm.load(register);
});
APPEND_OPCODES.add(36
/* Fetch */
, (vm, {
  op1: register
}) => {
  vm.fetch(register);
});
APPEND_OPCODES.add(58
/* BindDynamicScope */
, (vm, {
  op1: _names
}) => {
  let names = vm[CONSTANTS].getArray(_names);
  vm.bindDynamicScope(names);
});
APPEND_OPCODES.add(69
/* Enter */
, (vm, {
  op1: args
}) => {
  vm.enter(args);
});
APPEND_OPCODES.add(70
/* Exit */
, vm => {
  vm.exit();
});
APPEND_OPCODES.add(63
/* PushSymbolTable */
, (vm, {
  op1: _table
}) => {
  let stack = vm.stack;
  stack.push(vm[CONSTANTS].getSerializable(_table));
});
APPEND_OPCODES.add(62
/* PushBlockScope */
, vm => {
  let stack = vm.stack;
  stack.push(vm.scope());
});
APPEND_OPCODES.add(61
/* CompileBlock */
, vm => {
  let stack = vm.stack;
  let block = stack.pop();

  if (block) {
    stack.push(vm.compile(block));
  } else {
    stack.push(null);
  }
}, 'jit');
APPEND_OPCODES.add(64
/* InvokeYield */
, vm => {
  let {
    stack
  } = vm;
  let handle = stack.pop();
  let scope = stack.pop();
  let table = stack.pop();
  let args = stack.pop();

  if (table === null) {
    // To balance the pop{Frame,Scope}
    vm.pushFrame();
    vm.pushScope(scope); // Could be null but it doesnt matter as it is immediatelly popped.

    return;
  }

  let invokingScope = scope; // If necessary, create a child scope

  {
    let locals = table.parameters;
    let localsCount = locals.length;

    if (localsCount > 0) {
      invokingScope = invokingScope.child();

      for (let i = 0; i < localsCount; i++) {
        invokingScope.bindSymbol(locals[i], args.at(i));
      }
    }
  }
  vm.pushFrame();
  vm.pushScope(invokingScope);
  vm.call(handle);
});
APPEND_OPCODES.add(65
/* JumpIf */
, (vm, {
  op1: target
}) => {
  let reference = vm.stack.pop();

  if (isConst(reference)) {
    if (reference.value()) {
      vm.goto(target);
    }
  } else {
    let cache = new ReferenceCache(reference);

    if (cache.peek()) {
      vm.goto(target);
    }

    vm.updateWith(new Assert(cache));
  }
});
APPEND_OPCODES.add(66
/* JumpUnless */
, (vm, {
  op1: target
}) => {
  let reference = vm.stack.pop();

  if (isConst(reference)) {
    if (!reference.value()) {
      vm.goto(target);
    }
  } else {
    let cache = new ReferenceCache(reference);

    if (!cache.peek()) {
      vm.goto(target);
    }

    vm.updateWith(new Assert(cache));
  }
});
APPEND_OPCODES.add(67
/* JumpEq */
, (vm, {
  op1: target,
  op2: comparison
}) => {
  let other = vm.stack.peek();

  if (other === comparison) {
    vm.goto(target);
  }
});
APPEND_OPCODES.add(68
/* AssertSame */
, vm => {
  let reference = vm.stack.peek();

  if (!isConst(reference)) {
    vm.updateWith(Assert.initialize(new ReferenceCache(reference)));
  }
});
APPEND_OPCODES.add(71
/* ToBoolean */
, vm => {
  let {
    env,
    stack
  } = vm;
  stack.push(env.toConditionalReference(stack.pop()));
});
class Assert extends UpdatingOpcode {
  constructor(cache) {
    super();
    this.type = 'assert';
    this.tag = cache.tag;
    this.cache = cache;
  }

  static initialize(cache) {
    let assert = new Assert(cache);
    cache.peek();
    return assert;
  }

  evaluate(vm) {
    let {
      cache
    } = this;

    if (isModified(cache.revalidate())) {
      vm.throw();
    }
  }

}
class JumpIfNotModifiedOpcode extends UpdatingOpcode {
  constructor(tag, target) {
    super();
    this.target = target;
    this.type = 'jump-if-not-modified';
    this.tag = tag;
    this.lastRevision = valueForTag();
  }

  evaluate(vm) {
    let {
      tag,
      target,
      lastRevision
    } = this;

    if (!vm.alwaysRevalidate && validateTag(tag, lastRevision)) {
      vm.goto(target);
    }
  }

  didModify() {
    this.lastRevision = valueForTag(this.tag);
  }

}
class DidModifyOpcode extends UpdatingOpcode {
  constructor(target) {
    super();
    this.target = target;
    this.type = 'did-modify';
    this.tag = CONSTANT_TAG;
  }

  evaluate() {
    this.target.didModify();
  }

}
class LabelOpcode {
  constructor(label) {
    this.tag = CONSTANT_TAG;
    this.type = 'label';
    this.label = null;
    this.prev = null;
    this.next = null;
    initializeGuid(this);
    this.label = label;
  }

  evaluate() {}

  inspect() {
    return `${this.label} [${this._guid}]`;
  }

}

APPEND_OPCODES.add(41
/* Text */
, (vm, {
  op1: text
}) => {
  vm.elements().appendText(vm[CONSTANTS].getString(text));
});
APPEND_OPCODES.add(42
/* Comment */
, (vm, {
  op1: text
}) => {
  vm.elements().appendComment(vm[CONSTANTS].getString(text));
});
APPEND_OPCODES.add(48
/* OpenElement */
, (vm, {
  op1: tag
}) => {
  vm.elements().openElement(vm[CONSTANTS].getString(tag));
});
APPEND_OPCODES.add(49
/* OpenDynamicElement */
, vm => {
  let tagName = vm.stack.pop().value();
  vm.elements().openElement(tagName);
});
APPEND_OPCODES.add(50
/* PushRemoteElement */
, vm => {
  let elementRef = vm.stack.pop();
  let insertBeforeRef = vm.stack.pop();
  let guidRef = vm.stack.pop();
  let element;
  let insertBefore;
  let guid = guidRef.value();

  if (isConst(elementRef)) {
    element = elementRef.value();
  } else {
    let cache = new ReferenceCache(elementRef);
    element = cache.peek();
    vm.updateWith(new Assert(cache));
  }

  if (insertBeforeRef.value() !== undefined) {
    if (isConst(insertBeforeRef)) {
      insertBefore = insertBeforeRef.value();
    } else {
      let cache = new ReferenceCache(insertBeforeRef);
      insertBefore = cache.peek();
      vm.updateWith(new Assert(cache));
    }
  }

  let block = vm.elements().pushRemoteElement(element, guid, insertBefore);
  if (block) vm.associateDestroyable(block);
});
APPEND_OPCODES.add(56
/* PopRemoteElement */
, vm => {
  vm.elements().popRemoteElement();
});
APPEND_OPCODES.add(54
/* FlushElement */
, vm => {
  let operations = vm.fetchValue($t0);
  let modifiers = null;

  if (operations) {
    modifiers = operations.flush(vm);
    vm.loadValue($t0, null);
  }

  vm.elements().flushElement(modifiers);
});
APPEND_OPCODES.add(55
/* CloseElement */
, vm => {
  let modifiers = vm.elements().closeElement();

  if (modifiers) {
    modifiers.forEach(([manager, modifier]) => {
      vm.env.scheduleInstallModifier(modifier, manager);
      let d = manager.getDestructor(modifier);

      if (d) {
        vm.associateDestroyable(d);
      }
    });
  }
});
APPEND_OPCODES.add(57
/* Modifier */
, (vm, {
  op1: handle
}) => {
  let {
    manager,
    state
  } = vm.runtime.resolver.resolve(handle);
  let stack = vm.stack;
  let args = stack.pop();
  let {
    constructing,
    updateOperations
  } = vm.elements();
  let dynamicScope = vm.dynamicScope();
  let modifier = manager.create(constructing, state, args, dynamicScope, updateOperations);
  let operations = vm.fetchValue($t0);
  operations.addModifier(manager, modifier);
  let tag = manager.getTag(modifier);

  if (!isConstTag(tag)) {
    vm.updateWith(new UpdateModifierOpcode(tag, manager, modifier));
  }
});
class UpdateModifierOpcode extends UpdatingOpcode {
  constructor(tag, manager, modifier) {
    super();
    this.tag = tag;
    this.manager = manager;
    this.modifier = modifier;
    this.type = 'update-modifier';
    this.lastUpdated = valueForTag();
  }

  evaluate(vm) {
    let {
      manager,
      modifier,
      tag,
      lastUpdated
    } = this;

    if (!validateTag(tag, lastUpdated)) {
      vm.env.scheduleUpdateModifier(modifier, manager);
      this.lastUpdated = valueForTag();
    }
  }

}
APPEND_OPCODES.add(51
/* StaticAttr */
, (vm, {
  op1: _name,
  op2: _value,
  op3: _namespace
}) => {
  let name = vm[CONSTANTS].getString(_name);
  let value = vm[CONSTANTS].getString(_value);
  let namespace = _namespace ? vm[CONSTANTS].getString(_namespace) : null;
  vm.elements().setStaticAttribute(name, value, namespace);
});
APPEND_OPCODES.add(52
/* DynamicAttr */
, (vm, {
  op1: _name,
  op2: trusting,
  op3: _namespace
}) => {
  let name = vm[CONSTANTS].getString(_name);
  let reference = vm.stack.pop();
  let value = reference.value();
  let namespace = _namespace ? vm[CONSTANTS].getString(_namespace) : null;
  let attribute = vm.elements().setDynamicAttribute(name, value, !!trusting, namespace);

  if (!isConst(reference)) {
    vm.updateWith(new UpdateDynamicAttributeOpcode(reference, attribute));
  }
});
class UpdateDynamicAttributeOpcode extends UpdatingOpcode {
  constructor(reference, attribute) {
    super();
    this.reference = reference;
    this.attribute = attribute;
    this.type = 'patch-element';
    let {
      tag
    } = reference;
    this.tag = tag;
    this.lastRevision = valueForTag();
  }

  evaluate(vm) {
    let {
      attribute,
      reference,
      tag
    } = this;

    if (!validateTag(tag, this.lastRevision)) {
      attribute.update(reference.value(), vm.env);
      this.lastRevision = valueForTag();
    }
  }

}

/**
 * The VM creates a new ComponentInstance data structure for every component
 * invocation it encounters.
 *
 * Similar to how a ComponentDefinition contains state about all components of a
 * particular type, a ComponentInstance contains state specific to a particular
 * instance of a component type. It also contains a pointer back to its
 * component type's ComponentDefinition.
 */

const COMPONENT_INSTANCE = symbol$1('COMPONENT_INSTANCE');
APPEND_OPCODES.add(77
/* IsComponent */
, vm => {
  let stack = vm.stack;
  let ref = stack.pop();
  stack.push(new ConditionalReference(ref, isCurriedComponentDefinition));
});
APPEND_OPCODES.add(78
/* ContentType */
, vm => {
  let stack = vm.stack;
  let ref = stack.peek();
  stack.push(new ContentTypeReference(ref));
});
APPEND_OPCODES.add(79
/* CurryComponent */
, (vm, {
  op1: _meta
}) => {
  let stack = vm.stack;
  let definition = stack.pop();
  let capturedArgs = stack.pop();
  let meta = vm[CONSTANTS].getTemplateMeta(_meta);
  let resolver = vm.runtime.resolver;
  vm.loadValue($v0, new CurryComponentReference(definition, resolver, meta, capturedArgs)); // expectStackChange(vm.stack, -args.length - 1, 'CurryComponent');
});
APPEND_OPCODES.add(80
/* PushComponentDefinition */
, (vm, {
  op1: handle
}) => {
  let definition = vm.runtime.resolver.resolve(handle);
  let {
    manager
  } = definition;
  let capabilities = capabilityFlagsFrom(manager.getCapabilities(definition.state));
  let instance = {
    [COMPONENT_INSTANCE]: true,
    definition,
    manager,
    capabilities,
    state: null,
    handle: null,
    table: null,
    lookup: null
  };
  vm.stack.push(instance);
});
APPEND_OPCODES.add(83
/* ResolveDynamicComponent */
, (vm, {
  op1: _meta
}) => {
  let stack = vm.stack;
  let component = stack.pop().value();
  let meta = vm[CONSTANTS].getTemplateMeta(_meta);
  vm.loadValue($t1, null); // Clear the temp register

  let definition;

  if (typeof component === 'string') {
    let resolvedDefinition = resolveComponent(vm.runtime.resolver, component, meta);
    definition = resolvedDefinition;
  } else if (isCurriedComponentDefinition(component)) {
    definition = component;
  } else {
    throw unreachable();
  }

  stack.push(definition);
});
APPEND_OPCODES.add(81
/* PushDynamicComponentInstance */
, vm => {
  let {
    stack
  } = vm;
  let definition = stack.pop();
  let capabilities, manager;

  if (isCurriedComponentDefinition(definition)) {
    manager = capabilities = null;
  } else {
    manager = definition.manager;
    capabilities = capabilityFlagsFrom(manager.getCapabilities(definition.state));
  }

  stack.push({
    definition,
    capabilities,
    manager,
    state: null,
    handle: null,
    table: null
  });
});
APPEND_OPCODES.add(82
/* PushCurriedComponent */
, vm => {
  let stack = vm.stack;
  let component = stack.pop().value();
  let definition;

  if (isCurriedComponentDefinition(component)) {
    definition = component;
  } else {
    throw unreachable();
  }

  stack.push(definition);
});
APPEND_OPCODES.add(84
/* PushArgs */
, (vm, {
  op1: _names,
  op2: _blockNames,
  op3: flags
}) => {
  let stack = vm.stack;
  let names = vm[CONSTANTS].getStringArray(_names);
  let positionalCount = flags >> 4;
  let atNames = flags & 0b1000;
  let blockNames = flags & 0b0111 ? vm[CONSTANTS].getStringArray(_blockNames) : EMPTY_ARRAY;
  vm[ARGS].setup(stack, names, blockNames, positionalCount, !!atNames);
  stack.push(vm[ARGS]);
});
APPEND_OPCODES.add(85
/* PushEmptyArgs */
, vm => {
  let {
    stack
  } = vm;
  stack.push(vm[ARGS].empty(stack));
});
APPEND_OPCODES.add(88
/* CaptureArgs */
, vm => {
  let stack = vm.stack;
  let args = stack.pop();
  let capturedArgs = args.capture();
  stack.push(capturedArgs);
});
APPEND_OPCODES.add(87
/* PrepareArgs */
, (vm, {
  op1: _state
}) => {
  let stack = vm.stack;
  let instance = vm.fetchValue(_state);
  let args = stack.pop();
  let {
    definition
  } = instance;

  if (isCurriedComponentDefinition(definition)) {
    definition = resolveCurriedComponentDefinition(instance, definition, args);
  }

  let {
    manager,
    state
  } = definition;
  let capabilities = instance.capabilities;

  if (!managerHasCapability(manager, capabilities, 4
  /* PrepareArgs */
  )) {
    stack.push(args);
    return;
  }

  let blocks = args.blocks.values;
  let blockNames = args.blocks.names;
  let preparedArgs = manager.prepareArgs(state, args);

  if (preparedArgs) {
    args.clear();

    for (let i = 0; i < blocks.length; i++) {
      stack.push(blocks[i]);
    }

    let {
      positional,
      named
    } = preparedArgs;
    let positionalCount = positional.length;

    for (let i = 0; i < positionalCount; i++) {
      stack.push(positional[i]);
    }

    let names = Object.keys(named);

    for (let i = 0; i < names.length; i++) {
      stack.push(named[names[i]]);
    }

    args.setup(stack, names, blockNames, positionalCount, false);
  }

  stack.push(args);
});

function resolveCurriedComponentDefinition(instance, definition, args) {
  let unwrappedDefinition = instance.definition = definition.unwrap(args);
  let {
    manager,
    state
  } = unwrappedDefinition;
  instance.manager = manager;
  instance.capabilities = capabilityFlagsFrom(manager.getCapabilities(state));
  return unwrappedDefinition;
}

APPEND_OPCODES.add(89
/* CreateComponent */
, (vm, {
  op1: flags,
  op2: _state
}) => {
  let instance = vm.fetchValue(_state);
  let {
    definition,
    manager
  } = instance;
  let capabilities = instance.capabilities = capabilityFlagsFrom(manager.getCapabilities(definition.state));

  if (!managerHasCapability(manager, capabilities, 512
  /* CreateInstance */
  )) {
    throw new Error(`BUG`);
  }

  let dynamicScope = null;

  if (managerHasCapability(manager, capabilities, 64
  /* DynamicScope */
  )) {
    dynamicScope = vm.dynamicScope();
  }

  let hasDefaultBlock = flags & 1;
  let args = null;

  if (managerHasCapability(manager, capabilities, 8
  /* CreateArgs */
  )) {
    args = vm.stack.peek();
  }

  let self = null;

  if (managerHasCapability(manager, capabilities, 128
  /* CreateCaller */
  )) {
    self = vm.getSelf();
  }

  let state = manager.create(vm.env, definition.state, args, dynamicScope, self, !!hasDefaultBlock); // We want to reuse the `state` POJO here, because we know that the opcodes
  // only transition at exactly one place.

  instance.state = state;
  let tag = manager.getTag(state);

  if (managerHasCapability(manager, capabilities, 256
  /* UpdateHook */
  ) && !isConstTag(tag)) {
    vm.updateWith(new UpdateComponentOpcode(tag, state, manager, dynamicScope));
  }
});
APPEND_OPCODES.add(90
/* RegisterComponentDestructor */
, (vm, {
  op1: _state
}) => {
  let {
    manager,
    state,
    capabilities
  } = vm.fetchValue(_state);
  let d = manager.getDestructor(state);

  if (d) vm.associateDestroyable(d);
});
APPEND_OPCODES.add(100
/* BeginComponentTransaction */
, vm => {
  vm.beginCacheGroup();
  vm.elements().pushSimpleBlock();
});
APPEND_OPCODES.add(91
/* PutComponentOperations */
, vm => {
  vm.loadValue($t0, new ComponentElementOperations());
});
APPEND_OPCODES.add(53
/* ComponentAttr */
, (vm, {
  op1: _name,
  op2: trusting,
  op3: _namespace
}) => {
  let name = vm[CONSTANTS].getString(_name);
  let reference = vm.stack.pop();
  let namespace = _namespace ? vm[CONSTANTS].getString(_namespace) : null;
  vm.fetchValue($t0).setAttribute(name, reference, !!trusting, namespace);
});
APPEND_OPCODES.add(108
/* StaticComponentAttr */
, (vm, {
  op1: _name,
  op2: _value,
  op3: _namespace
}) => {
  let name = vm[CONSTANTS].getString(_name);
  let value = vm[CONSTANTS].getString(_value);
  let namespace = _namespace ? vm[CONSTANTS].getString(_namespace) : null;
  vm.fetchValue($t0).setStaticAttribute(name, value, namespace);
});
class ComponentElementOperations {
  constructor() {
    this.attributes = dict();
    this.classes = [];
    this.modifiers = [];
  }

  setAttribute(name, value, trusting, namespace) {
    let deferred = {
      value,
      namespace,
      trusting
    };

    if (name === 'class') {
      this.classes.push(value);
    }

    this.attributes[name] = deferred;
  }

  setStaticAttribute(name, value, namespace) {
    let deferred = {
      value,
      namespace
    };

    if (name === 'class') {
      this.classes.push(value);
    }

    this.attributes[name] = deferred;
  }

  addModifier(manager, state) {
    this.modifiers.push([manager, state]);
  }

  flush(vm) {
    let type;
    let attributes = this.attributes;

    for (let name in this.attributes) {
      if (name === 'type') {
        type = attributes[name];
        continue;
      }

      let attr = this.attributes[name];

      if (name === 'class') {
        setDeferredAttr(vm, 'class', mergeClasses(this.classes), attr.namespace, attr.trusting);
      } else {
        setDeferredAttr(vm, name, attr.value, attr.namespace, attr.trusting);
      }
    }

    if (type !== undefined) {
      setDeferredAttr(vm, 'type', type.value, type.namespace, type.trusting);
    }

    return this.modifiers;
  }

}

function mergeClasses(classes) {
  if (classes.length === 0) {
    return '';
  }

  if (classes.length === 1) {
    return classes[0];
  }

  if (allStringClasses(classes)) {
    return classes.join(' ');
  }

  return makeClassList(classes);
}

function makeClassList(classes) {
  for (let i = 0; i < classes.length; i++) {
    const value = classes[i];

    if (typeof value === 'string') {
      classes[i] = PrimitiveReference$1.create(value);
    }
  }

  return new ClassListReference(classes);
}

function allStringClasses(classes) {
  for (let i = 0; i < classes.length; i++) {
    if (typeof classes[i] !== 'string') {
      return false;
    }
  }

  return true;
}

function setDeferredAttr(vm, name, value, namespace, trusting = false) {
  if (typeof value === 'string') {
    vm.elements().setStaticAttribute(name, value, namespace);
  } else {
    let attribute = vm.elements().setDynamicAttribute(name, value.value(), trusting, namespace);

    if (!isConst(value)) {
      vm.updateWith(new UpdateDynamicAttributeOpcode(value, attribute));
    }
  }
}

APPEND_OPCODES.add(102
/* DidCreateElement */
, (vm, {
  op1: _state
}) => {
  let {
    definition,
    state
  } = vm.fetchValue(_state);
  let {
    manager
  } = definition;
  let operations = vm.fetchValue($t0);
  manager.didCreateElement(state, vm.elements().constructing, operations);
});
APPEND_OPCODES.add(92
/* GetComponentSelf */
, (vm, {
  op1: _state
}) => {
  let {
    definition,
    state
  } = vm.fetchValue(_state);
  let {
    manager
  } = definition;
  vm.stack.push(manager.getSelf(state));
});
APPEND_OPCODES.add(93
/* GetComponentTagName */
, (vm, {
  op1: _state
}) => {
  let {
    definition,
    state
  } = vm.fetchValue(_state);
  let {
    manager
  } = definition;
  vm.stack.push(manager.getTagName(state));
}); // Dynamic Invocation Only

APPEND_OPCODES.add(95
/* GetJitComponentLayout */
, (vm, {
  op1: _state
}) => {
  let instance = vm.fetchValue(_state);
  let manager = instance.manager;
  let {
    definition
  } = instance;
  let {
    stack
  } = vm;
  let {
    capabilities
  } = instance; // let invoke: { handle: number; symbolTable: ProgramSymbolTable };

  let layout;

  if (hasStaticLayoutCapability(capabilities, manager)) {
    layout = manager.getJitStaticLayout(definition.state, vm.runtime.resolver);
  } else if (hasDynamicLayoutCapability(capabilities, manager)) {
    let template = unwrapTemplate(manager.getJitDynamicLayout(instance.state, vm.runtime.resolver));

    if (hasCapability(capabilities, 1024
    /* Wrapped */
    )) {
      layout = template.asWrappedLayout();
    } else {
      layout = template.asLayout();
    }
  } else {
    throw unreachable();
  }

  let handle = layout.compile(vm.context);
  stack.push(layout.symbolTable);
  stack.push(handle);
}, 'jit'); // Dynamic Invocation Only

APPEND_OPCODES.add(94
/* GetAotComponentLayout */
, (vm, {
  op1: _state
}) => {
  let instance = vm.fetchValue(_state);
  let {
    manager,
    definition
  } = instance;
  let {
    stack
  } = vm;
  let {
    state: instanceState,
    capabilities
  } = instance;
  let {
    state: definitionState
  } = definition;
  let invoke;

  if (hasStaticLayoutCapability(capabilities, manager)) {
    invoke = manager.getAotStaticLayout(definitionState, vm.runtime.resolver);
  } else if (hasDynamicLayoutCapability(capabilities, manager)) {
    invoke = manager.getAotDynamicLayout(instanceState, vm.runtime.resolver);
  } else {
    throw unreachable();
  }

  stack.push(invoke.symbolTable);
  stack.push(invoke.handle);
}); // These types are absurd here

function hasStaticLayoutCapability(capabilities, _manager) {
  return managerHasCapability(_manager, capabilities, 1
  /* DynamicLayout */
  ) === false;
}
function hasDynamicLayoutCapability(capabilities, _manager) {
  return managerHasCapability(_manager, capabilities, 1
  /* DynamicLayout */
  ) === true;
}
APPEND_OPCODES.add(76
/* Main */
, (vm, {
  op1: register
}) => {
  let definition = vm.stack.pop();
  let invocation = vm.stack.pop();
  let {
    manager
  } = definition;
  let capabilities = capabilityFlagsFrom(manager.getCapabilities(definition.state));
  let state = {
    [COMPONENT_INSTANCE]: true,
    definition,
    manager,
    capabilities,
    state: null,
    handle: invocation.handle,
    table: invocation.symbolTable,
    lookup: null
  };
  vm.loadValue(register, state);
});
APPEND_OPCODES.add(98
/* PopulateLayout */
, (vm, {
  op1: _state
}) => {
  let {
    stack
  } = vm;
  let handle = stack.pop();
  let table = stack.pop();
  let state = vm.fetchValue(_state);
  state.handle = handle;
  state.table = table;
});
APPEND_OPCODES.add(38
/* VirtualRootScope */
, (vm, {
  op1: _state
}) => {
  let {
    symbols
  } = vm.fetchValue(_state).table;
  vm.pushRootScope(symbols.length + 1);
});
APPEND_OPCODES.add(97
/* SetupForEval */
, (vm, {
  op1: _state
}) => {
  let state = vm.fetchValue(_state);

  if (state.table.hasEval) {
    let lookup = state.lookup = dict();
    vm.scope().bindEvalScope(lookup);
  }
});
APPEND_OPCODES.add(17
/* SetNamedVariables */
, (vm, {
  op1: _state
}) => {
  let state = vm.fetchValue(_state);
  let scope = vm.scope();
  let args = vm.stack.peek();
  let callerNames = args.named.atNames;

  for (let i = callerNames.length - 1; i >= 0; i--) {
    let atName = callerNames[i];
    let symbol = state.table.symbols.indexOf(callerNames[i]);
    let value = args.named.get(atName, true);
    if (symbol !== -1) scope.bindSymbol(symbol + 1, value);
    if (state.lookup) state.lookup[atName] = value;
  }
});

function bindBlock(symbolName, blockName, state, blocks, vm) {
  let symbol = state.table.symbols.indexOf(symbolName);
  let block = blocks.get(blockName);
  if (symbol !== -1) vm.scope().bindBlock(symbol + 1, block);
  if (state.lookup) state.lookup[symbolName] = block;
}

APPEND_OPCODES.add(18
/* SetBlocks */
, (vm, {
  op1: _state
}) => {
  let state = vm.fetchValue(_state);
  let {
    blocks
  } = vm.stack.peek();

  for (let i = 0; i < blocks.names.length; i++) {
    bindBlock(blocks.symbolNames[i], blocks.names[i], state, blocks, vm);
  }
}); // Dynamic Invocation Only

APPEND_OPCODES.add(99
/* InvokeComponentLayout */
, (vm, {
  op1: _state
}) => {
  let state = vm.fetchValue(_state);
  vm.call(state.handle);
});
APPEND_OPCODES.add(103
/* DidRenderLayout */
, (vm, {
  op1: _state
}) => {
  let {
    manager,
    state,
    capabilities
  } = vm.fetchValue(_state);
  let bounds = vm.elements().popBlock();

  if (!managerHasCapability(manager, capabilities, 512
  /* CreateInstance */
  )) {
    throw new Error(`BUG`);
  }

  let mgr = manager;
  mgr.didRenderLayout(state, bounds);
  vm.env.didCreate(state, manager);
  vm.updateWith(new DidUpdateLayoutOpcode(manager, state, bounds));
});
APPEND_OPCODES.add(101
/* CommitComponentTransaction */
, vm => {
  vm.commitCacheGroup();
});
class UpdateComponentOpcode extends UpdatingOpcode {
  constructor(tag, component, manager, dynamicScope) {
    super();
    this.tag = tag;
    this.component = component;
    this.manager = manager;
    this.dynamicScope = dynamicScope;
    this.type = 'update-component';
  }

  evaluate(_vm) {
    let {
      component,
      manager,
      dynamicScope
    } = this;
    manager.update(component, dynamicScope);
  }

}
class DidUpdateLayoutOpcode extends UpdatingOpcode {
  constructor(manager, component, bounds) {
    super();
    this.manager = manager;
    this.component = component;
    this.bounds = bounds;
    this.type = 'did-update-layout';
    this.tag = CONSTANT_TAG;
  }

  evaluate(vm) {
    let {
      manager,
      component,
      bounds
    } = this;
    manager.didUpdateLayout(component, bounds);
    vm.env.didUpdate(component, manager);
  }

}

function debugCallback(context, get) {
  console.info('Use `context`, and `get(<path>)` to debug this template.'); // for example...
  // eslint-disable-next-line no-unused-expressions

  context === get('this'); // eslint-disable-next-line no-debugger

  debugger;
}

let callback = debugCallback; // For testing purposes

class ScopeInspector {
  constructor(scope, symbols, evalInfo) {
    this.scope = scope;
    this.locals = dict();

    for (let i = 0; i < evalInfo.length; i++) {
      let slot = evalInfo[i];
      let name = symbols[slot - 1];
      let ref = scope.getSymbol(slot);
      this.locals[name] = ref;
    }
  }

  get(path) {
    let {
      scope,
      locals
    } = this;
    let parts = path.split('.');
    let [head, ...tail] = path.split('.');
    let evalScope = scope.getEvalScope();
    let ref;

    if (head === 'this') {
      ref = scope.getSelf();
    } else if (locals[head]) {
      ref = locals[head];
    } else if (head.indexOf('@') === 0 && evalScope[head]) {
      ref = evalScope[head];
    } else {
      ref = this.scope.getSelf();
      tail = parts;
    }

    return tail.reduce((r, part) => r.get(part), ref);
  }

}

APPEND_OPCODES.add(106
/* Debugger */
, (vm, {
  op1: _symbols,
  op2: _evalInfo
}) => {
  let symbols = vm[CONSTANTS].getStringArray(_symbols);
  let evalInfo = vm[CONSTANTS].getArray(_evalInfo);
  let inspector = new ScopeInspector(vm.scope(), symbols, evalInfo);
  callback(vm.getSelf().value(), path => inspector.get(path).value());
});

APPEND_OPCODES.add(104
/* InvokePartial */
, (vm, {
  op1: _meta,
  op2: _symbols,
  op3: _evalInfo
}) => {
  let {
    [CONSTANTS]: constants,
    stack
  } = vm;
  let name = stack.pop().value();
  let meta = constants.getTemplateMeta(_meta);
  let outerSymbols = constants.getStringArray(_symbols);
  let evalInfo = constants.getArray(_evalInfo);
  let handle = vm.runtime.resolver.lookupPartial(name, meta);
  let definition = vm.runtime.resolver.resolve(handle);
  let {
    symbolTable,
    handle: vmHandle
  } = definition.getPartial(vm.context);
  {
    let partialSymbols = symbolTable.symbols;
    let outerScope = vm.scope();
    let partialScope = vm.pushRootScope(partialSymbols.length);
    let evalScope = outerScope.getEvalScope();
    partialScope.bindEvalScope(evalScope);
    partialScope.bindSelf(outerScope.getSelf());
    let locals = Object.create(outerScope.getPartialMap());

    for (let i = 0; i < evalInfo.length; i++) {
      let slot = evalInfo[i];
      let name = outerSymbols[slot - 1];
      let ref = outerScope.getSymbol(slot);
      locals[name] = ref;
    }

    if (evalScope) {
      for (let i = 0; i < partialSymbols.length; i++) {
        let name = partialSymbols[i];
        let symbol = i + 1;
        let value = evalScope[name];
        if (value !== undefined) partialScope.bind(symbol, value);
      }
    }

    partialScope.bindPartialMap(locals);
    vm.pushFrame(); // sp += 2

    vm.call(unwrapHandle(vmHandle));
  }
}, 'jit');

class IterablePresenceReference {
  constructor(artifacts) {
    this.tag = artifacts.tag;
    this.artifacts = artifacts;
  }

  value() {
    return !this.artifacts.isEmpty();
  }

}

APPEND_OPCODES.add(74
/* PutIterator */
, vm => {
  let stack = vm.stack;
  let listRef = stack.pop();
  let key = stack.pop();
  let iterable = vm.env.iterableFor(listRef, key.value());
  let iterator = new ReferenceIterator(iterable);
  stack.push(iterator);
  stack.push(new IterablePresenceReference(iterator.artifacts));
});
APPEND_OPCODES.add(72
/* EnterList */
, (vm, {
  op1: relativeStart
}) => {
  vm.enterList(relativeStart);
});
APPEND_OPCODES.add(73
/* ExitList */
, vm => {
  vm.exitList();
});
APPEND_OPCODES.add(75
/* Iterate */
, (vm, {
  op1: breaks
}) => {
  let stack = vm.stack;
  let item = stack.peek().next();

  if (item) {
    let tryOpcode = vm.iterate(item.memo, item.value);
    vm.enterItem(item.key, tryOpcode);
  } else {
    vm.goto(breaks);
  }
});

class DefaultDynamicScope {
  constructor(bucket) {
    if (bucket) {
      this.bucket = assign({}, bucket);
    } else {
      this.bucket = {};
    }
  }

  get(key) {
    return this.bucket[key];
  }

  set(key, reference) {
    return this.bucket[key] = reference;
  }

  child() {
    return new DefaultDynamicScope(this.bucket);
  }

}

/*
  The calling convention is:

  * 0-N block arguments at the bottom
  * 0-N positional arguments next (left-to-right)
  * 0-N named arguments next
*/

class VMArgumentsImpl {
  constructor() {
    this.stack = null;
    this.positional = new PositionalArgumentsImpl();
    this.named = new NamedArgumentsImpl();
    this.blocks = new BlockArgumentsImpl();
  }

  empty(stack) {
    let base = stack[REGISTERS][$sp] + 1;
    this.named.empty(stack, base);
    this.positional.empty(stack, base);
    this.blocks.empty(stack, base);
    return this;
  }

  setup(stack, names, blockNames, positionalCount, atNames) {
    this.stack = stack;
    /*
           | ... | blocks      | positional  | named |
           | ... | b0    b1    | p0 p1 p2 p3 | n0 n1 |
     index | ... | 4/5/6 7/8/9 | 10 11 12 13 | 14 15 |
                   ^             ^             ^  ^
                 bbase         pbase       nbase  sp
    */

    let named = this.named;
    let namedCount = names.length;
    let namedBase = stack[REGISTERS][$sp] - namedCount + 1;
    named.setup(stack, namedBase, namedCount, names, atNames);
    let positional = this.positional;
    let positionalBase = namedBase - positionalCount;
    positional.setup(stack, positionalBase, positionalCount);
    let blocks = this.blocks;
    let blocksCount = blockNames.length;
    let blocksBase = positionalBase - blocksCount * 3;
    blocks.setup(stack, blocksBase, blocksCount, blockNames);
  }

  get tag() {
    return combineTagged([this.positional, this.named]);
  }

  get base() {
    return this.blocks.base;
  }

  get length() {
    return this.positional.length + this.named.length + this.blocks.length * 3;
  }

  at(pos) {
    return this.positional.at(pos);
  }

  realloc(offset) {
    let {
      stack
    } = this;

    if (offset > 0 && stack !== null) {
      let {
        positional,
        named
      } = this;
      let newBase = positional.base + offset;
      let length = positional.length + named.length;

      for (let i = length - 1; i >= 0; i--) {
        stack.copy(i + positional.base, i + newBase);
      }

      positional.base += offset;
      named.base += offset;
      stack[REGISTERS][$sp] += offset;
    }
  }

  capture() {
    let positional = this.positional.length === 0 ? EMPTY_POSITIONAL : this.positional.capture();
    let named = this.named.length === 0 ? EMPTY_NAMED : this.named.capture();
    return new CapturedArgumentsImpl(this.tag, positional, named, this.length);
  }

  clear() {
    let {
      stack,
      length
    } = this;
    if (length > 0 && stack !== null) stack.pop(length);
  }

}
class PositionalArgumentsImpl {
  constructor() {
    this.base = 0;
    this.length = 0;
    this.stack = null;
    this._tag = null;
    this._references = null;
  }

  empty(stack, base) {
    this.stack = stack;
    this.base = base;
    this.length = 0;
    this._tag = CONSTANT_TAG;
    this._references = EMPTY_ARRAY;
  }

  setup(stack, base, length) {
    this.stack = stack;
    this.base = base;
    this.length = length;

    if (length === 0) {
      this._tag = CONSTANT_TAG;
      this._references = EMPTY_ARRAY;
    } else {
      this._tag = null;
      this._references = null;
    }
  }

  get tag() {
    let tag = this._tag;

    if (!tag) {
      tag = this._tag = combineTagged(this.references);
    }

    return tag;
  }

  at(position) {
    let {
      base,
      length,
      stack
    } = this;

    if (position < 0 || position >= length) {
      return UNDEFINED_REFERENCE$1;
    }

    return stack.get(position, base);
  }

  capture() {
    return new CapturedPositionalArgumentsImpl(this.tag, this.references);
  }

  prepend(other) {
    let additions = other.length;

    if (additions > 0) {
      let {
        base,
        length,
        stack
      } = this;
      this.base = base = base - additions;
      this.length = length + additions;

      for (let i = 0; i < additions; i++) {
        stack.set(other.at(i), i, base);
      }

      this._tag = null;
      this._references = null;
    }
  }

  get references() {
    let references = this._references;

    if (!references) {
      let {
        stack,
        base,
        length
      } = this;
      references = this._references = stack.sliceArray(base, base + length);
    }

    return references;
  }

}
class CapturedPositionalArgumentsImpl {
  constructor(tag, references, length = references.length) {
    this.tag = tag;
    this.references = references;
    this.length = length;
  }

  static empty() {
    return new CapturedPositionalArgumentsImpl(CONSTANT_TAG, EMPTY_ARRAY, 0);
  }

  at(position) {
    return this.references[position];
  }

  value() {
    return this.references.map(this.valueOf);
  }

  get(name) {
    let {
      references,
      length
    } = this;

    if (name === 'length') {
      return PrimitiveReference$1.create(length);
    } else {
      let idx = parseInt(name, 10);

      if (idx < 0 || idx >= length) {
        return UNDEFINED_REFERENCE$1;
      } else {
        return references[idx];
      }
    }
  }

  valueOf(reference) {
    return reference.value();
  }

}
class NamedArgumentsImpl {
  constructor() {
    this.base = 0;
    this.length = 0;
    this._references = null;
    this._names = EMPTY_ARRAY;
    this._atNames = EMPTY_ARRAY;
  }

  empty(stack, base) {
    this.stack = stack;
    this.base = base;
    this.length = 0;
    this._references = EMPTY_ARRAY;
    this._names = EMPTY_ARRAY;
    this._atNames = EMPTY_ARRAY;
  }

  setup(stack, base, length, names, atNames) {
    this.stack = stack;
    this.base = base;
    this.length = length;

    if (length === 0) {
      this._references = EMPTY_ARRAY;
      this._names = EMPTY_ARRAY;
      this._atNames = EMPTY_ARRAY;
    } else {
      this._references = null;

      if (atNames) {
        this._names = null;
        this._atNames = names;
      } else {
        this._names = names;
        this._atNames = null;
      }
    }
  }

  get tag() {
    return combineTagged(this.references);
  }

  get names() {
    let names = this._names;

    if (!names) {
      names = this._names = this._atNames.map(this.toSyntheticName);
    }

    return names;
  }

  get atNames() {
    let atNames = this._atNames;

    if (!atNames) {
      atNames = this._atNames = this._names.map(this.toAtName);
    }

    return atNames;
  }

  has(name) {
    return this.names.indexOf(name) !== -1;
  }

  get(name, atNames = false) {
    let {
      base,
      stack
    } = this;
    let names = atNames ? this.atNames : this.names;
    let idx = names.indexOf(name);

    if (idx === -1) {
      return UNDEFINED_REFERENCE$1;
    }

    return stack.get(idx, base);
  }

  capture() {
    return new CapturedNamedArgumentsImpl(this.tag, this.names, this.references);
  }

  merge(other) {
    let {
      length: extras
    } = other;

    if (extras > 0) {
      let {
        names,
        length,
        stack
      } = this;
      let {
        names: extraNames
      } = other;

      if (Object.isFrozen(names) && names.length === 0) {
        names = [];
      }

      for (let i = 0; i < extras; i++) {
        let name = extraNames[i];
        let idx = names.indexOf(name);

        if (idx === -1) {
          length = names.push(name);
          stack.push(other.references[i]);
        }
      }

      this.length = length;
      this._references = null;
      this._names = names;
      this._atNames = null;
    }
  }

  get references() {
    let references = this._references;

    if (!references) {
      let {
        base,
        length,
        stack
      } = this;
      references = this._references = stack.sliceArray(base, base + length);
    }

    return references;
  }

  toSyntheticName(name) {
    return name.slice(1);
  }

  toAtName(name) {
    return `@${name}`;
  }

}
class CapturedNamedArgumentsImpl {
  constructor(tag, names, references) {
    this.tag = tag;
    this.names = names;
    this.references = references;
    this.length = names.length;
    this._map = null;
  }

  get map() {
    let map = this._map;

    if (!map) {
      let {
        names,
        references
      } = this;
      map = this._map = dict();

      for (let i = 0; i < names.length; i++) {
        let name = names[i];
        map[name] = references[i];
      }
    }

    return map;
  }

  has(name) {
    return this.names.indexOf(name) !== -1;
  }

  get(name) {
    let {
      names,
      references
    } = this;
    let idx = names.indexOf(name);

    if (idx === -1) {
      return UNDEFINED_REFERENCE$1;
    } else {
      return references[idx];
    }
  }

  value() {
    let {
      names,
      references
    } = this;
    let out = dict();

    for (let i = 0; i < names.length; i++) {
      let name = names[i];
      out[name] = references[i].value();
    }

    return out;
  }

}

function toSymbolName(name) {
  return `&${name}`;
}

class BlockArgumentsImpl {
  constructor() {
    this.internalValues = null;
    this._symbolNames = null;
    this.internalTag = null;
    this.names = EMPTY_ARRAY;
    this.length = 0;
    this.base = 0;
  }

  empty(stack, base) {
    this.stack = stack;
    this.names = EMPTY_ARRAY;
    this.base = base;
    this.length = 0;
    this._symbolNames = null;
    this.internalTag = CONSTANT_TAG;
    this.internalValues = EMPTY_ARRAY;
  }

  setup(stack, base, length, names) {
    this.stack = stack;
    this.names = names;
    this.base = base;
    this.length = length;
    this._symbolNames = null;

    if (length === 0) {
      this.internalTag = CONSTANT_TAG;
      this.internalValues = EMPTY_ARRAY;
    } else {
      this.internalTag = null;
      this.internalValues = null;
    }
  }

  get values() {
    let values = this.internalValues;

    if (!values) {
      let {
        base,
        length,
        stack
      } = this;
      values = this.internalValues = stack.sliceArray(base, base + length * 3);
    }

    return values;
  }

  has(name) {
    return this.names.indexOf(name) !== -1;
  }

  get(name) {
    let idx = this.names.indexOf(name);

    if (idx === -1) {
      return null;
    }

    let {
      base,
      stack
    } = this;
    let table = stack.get(idx * 3, base);
    let scope = stack.get(idx * 3 + 1, base);
    let handle = stack.get(idx * 3 + 2, base);
    return handle === null ? null : [handle, scope, table];
  }

  capture() {
    return new CapturedBlockArgumentsImpl(this.names, this.values);
  }

  get symbolNames() {
    let symbolNames = this._symbolNames;

    if (symbolNames === null) {
      symbolNames = this._symbolNames = this.names.map(toSymbolName);
    }

    return symbolNames;
  }

}

class CapturedBlockArgumentsImpl {
  constructor(names, values) {
    this.names = names;
    this.values = values;
    this.length = names.length;
  }

  has(name) {
    return this.names.indexOf(name) !== -1;
  }

  get(name) {
    let idx = this.names.indexOf(name);
    if (idx === -1) return null;
    return [this.values[idx * 3 + 2], this.values[idx * 3 + 1], this.values[idx * 3]];
  }

}

class CapturedArgumentsImpl {
  constructor(tag, positional, named, length) {
    this.tag = tag;
    this.positional = positional;
    this.named = named;
    this.length = length;
  }

  value() {
    return {
      named: this.named.value(),
      positional: this.positional.value()
    };
  }

}
const EMPTY_NAMED = new CapturedNamedArgumentsImpl(CONSTANT_TAG, EMPTY_ARRAY, EMPTY_ARRAY);
const EMPTY_POSITIONAL = new CapturedPositionalArgumentsImpl(CONSTANT_TAG, EMPTY_ARRAY);

function initializeRegistersWithSP(sp) {
  return [0, -1, sp, 0];
}
class LowLevelVM {
  constructor(stack, heap, program, externs, registers) {
    this.stack = stack;
    this.heap = heap;
    this.program = program;
    this.externs = externs;
    this.registers = registers;
    this.currentOpSize = 0;
  }

  fetchRegister(register) {
    return this.registers[register];
  }

  loadRegister(register, value) {
    this.registers[register] = value;
  }

  setPc(pc) {
    this.registers[$pc] = pc;
  } // Start a new frame and save $ra and $fp on the stack


  pushFrame() {
    this.stack.push(this.registers[$ra]);
    this.stack.push(this.registers[$fp]);
    this.registers[$fp] = this.registers[$sp] - 1;
  } // Restore $ra, $sp and $fp


  popFrame() {
    this.registers[$sp] = this.registers[$fp] - 1;
    this.registers[$ra] = this.stack.get(0);
    this.registers[$fp] = this.stack.get(1);
  }

  pushSmallFrame() {
    this.stack.push(this.registers[$ra]);
  }

  popSmallFrame() {
    this.registers[$ra] = this.stack.pop();
  } // Jump to an address in `program`


  goto(offset) {
    this.setPc(this.target(offset));
  }

  target(offset) {
    return this.registers[$pc] + offset - this.currentOpSize;
  } // Save $pc into $ra, then jump to a new address in `program` (jal in MIPS)


  call(handle) {
    this.registers[$ra] = this.registers[$pc];
    this.setPc(this.heap.getaddr(handle));
  } // Put a specific `program` address in $ra


  returnTo(offset) {
    this.registers[$ra] = this.target(offset);
  } // Return to the `program` address stored in $ra


  return() {
    this.setPc(this.registers[$ra]);
  }

  nextStatement() {
    let {
      registers,
      program
    } = this;
    let pc = registers[$pc];

    if (pc === -1) {
      return null;
    } // We have to save off the current operations size so that
    // when we do a jump we can calculate the correct offset
    // to where we are going. We can't simply ask for the size
    // in a jump because we have have already incremented the
    // program counter to the next instruction prior to executing.


    let opcode = program.opcode(pc);
    let operationSize = this.currentOpSize = opcode.size;
    this.registers[$pc] += operationSize;
    return opcode;
  }

  evaluateOuter(opcode, vm) {
    {
      this.evaluateInner(opcode, vm);
    }
  }

  evaluateInner(opcode, vm) {
    if (opcode.isMachine) {
      this.evaluateMachine(opcode);
    } else {
      this.evaluateSyscall(opcode, vm);
    }
  }

  evaluateMachine(opcode) {
    switch (opcode.type) {
      case 0
      /* PushFrame */
      :
        return this.pushFrame();

      case 1
      /* PopFrame */
      :
        return this.popFrame();

      case 3
      /* InvokeStatic */
      :
        return this.call(opcode.op1);

      case 2
      /* InvokeVirtual */
      :
        return this.call(this.stack.pop());

      case 4
      /* Jump */
      :
        return this.goto(opcode.op1);

      case 5
      /* Return */
      :
        return this.return();

      case 6
      /* ReturnTo */
      :
        return this.returnTo(opcode.op1);
    }
  }

  evaluateSyscall(opcode, vm) {
    APPEND_OPCODES.evaluate(vm, opcode, opcode.type);
  }

}

class UpdatingVM {
  constructor(env, {
    alwaysRevalidate = false
  }) {
    this.frameStack = new StackImpl();
    this.env = env;
    this.dom = env.getDOM();
    this.alwaysRevalidate = alwaysRevalidate;
  }

  execute(opcodes, handler) {
    let {
      frameStack
    } = this;
    this.try(opcodes, handler);

    while (true) {
      if (frameStack.isEmpty()) break;
      let opcode = this.frame.nextStatement();

      if (opcode === null) {
        frameStack.pop();
        continue;
      }

      opcode.evaluate(this);
    }
  }

  get frame() {
    return this.frameStack.current;
  }

  goto(op) {
    this.frame.goto(op);
  }

  try(ops, handler) {
    this.frameStack.push(new UpdatingVMFrame(ops, handler));
  }

  throw() {
    this.frame.handleException();
    this.frameStack.pop();
  }

}
class ResumableVMStateImpl {
  constructor(state, resumeCallback) {
    this.state = state;
    this.resumeCallback = resumeCallback;
  }

  resume(runtime, builder) {
    return this.resumeCallback(runtime, this.state, builder);
  }

}
class BlockOpcode extends UpdatingOpcode {
  constructor(state, runtime, bounds, children) {
    super();
    this.state = state;
    this.runtime = runtime;
    this.type = 'block';
    this.next = null;
    this.prev = null;
    this.children = children;
    this.bounds = bounds;
  }

  parentElement() {
    return this.bounds.parentElement();
  }

  firstNode() {
    return this.bounds.firstNode();
  }

  lastNode() {
    return this.bounds.lastNode();
  }

  evaluate(vm) {
    vm.try(this.children, null);
  }

}
class TryOpcode extends BlockOpcode {
  constructor(state, runtime, bounds, children) {
    super(state, runtime, bounds, children);
    this.type = 'try';
    this.tag = this._tag = createUpdatableTag();
  }

  didInitializeChildren() {
    updateTag(this._tag, combineSlice(this.children));
  }

  evaluate(vm) {
    vm.try(this.children, this);
  }

  handleException() {
    let {
      state,
      bounds,
      children,
      prev,
      next,
      runtime
    } = this;
    legacySyncReset(this, runtime.env);
    children.clear();
    asyncReset(this, runtime.env);
    let elementStack = NewElementBuilder.resume(runtime.env, bounds);
    let vm = state.resume(runtime, elementStack);
    let updating = new LinkedList();
    let result = vm.execute(vm => {
      vm.pushUpdating(updating);
      vm.updateWith(this);
      vm.pushUpdating(children);
    });
    associate(this, result.drop);
    this.prev = prev;
    this.next = next;
  }

}

class ListRevalidationDelegate {
  constructor(opcode, marker) {
    this.opcode = opcode;
    this.marker = marker;
    this.didInsert = false;
    this.didDelete = false;
    this.map = opcode.map;
    this.updating = opcode['children'];
  }

  insert(_env, key, item, memo, before) {
    let {
      map,
      opcode,
      updating
    } = this;
    let nextSibling = null;
    let reference = null;
    reference = map.get(before);
    nextSibling = reference !== undefined ? reference['bounds'].firstNode() : this.marker;
    let vm = opcode.vmForInsertion(nextSibling);
    let tryOpcode = null;
    let result = vm.execute(vm => {
      tryOpcode = vm.iterate(memo, item);
      map.set(key, tryOpcode);
      vm.pushUpdating(new LinkedList());
      vm.updateWith(tryOpcode);
      vm.pushUpdating(tryOpcode.children);
    });
    updating.insertBefore(tryOpcode, reference);
    associate(opcode, result.drop);
    this.didInsert = true;
  }

  retain(_env, _key, _item, _memo) {}

  move(_env, key, _item, _memo, before) {
    let {
      map,
      updating
    } = this;
    let entry = map.get(key);

    if (before === END) {
      move(entry, this.marker);
      updating.remove(entry);
      updating.append(entry);
    } else {
      let reference = map.get(before);
      move(entry, reference.firstNode());
      updating.remove(entry);
      updating.insertBefore(entry, reference);
    }
  }

  delete(env, key) {
    let {
      map,
      updating
    } = this;
    let opcode = map.get(key);
    detach(opcode, env);
    updating.remove(opcode);
    map.delete(key);
    this.didDelete = true;
  }

  done() {
    this.opcode.didInitializeChildren(this.didInsert || this.didDelete);
  }

}

class ListBlockOpcode extends BlockOpcode {
  constructor(state, runtime, bounds, children, artifacts) {
    super(state, runtime, bounds, children);
    this.type = 'list-block';
    this.map = new Map();
    this.lastIterated = INITIAL;
    this.artifacts = artifacts;

    let _tag = this._tag = createUpdatableTag();

    this.tag = combine([artifacts.tag, _tag]);
  }

  didInitializeChildren(listDidChange = true) {
    this.lastIterated = valueForTag(this.artifacts.tag);

    if (listDidChange) {
      updateTag(this._tag, combineSlice(this.children));
    }
  }

  evaluate(vm) {
    let {
      artifacts,
      lastIterated
    } = this;

    if (!validateTag(artifacts.tag, lastIterated)) {
      let {
        bounds
      } = this;
      let {
        dom
      } = vm;
      let marker = dom.createComment('');
      dom.insertAfter(bounds.parentElement(), marker, bounds.lastNode());
      let target = new ListRevalidationDelegate(this, marker);
      let synchronizer = new IteratorSynchronizer({
        target,
        artifacts,
        env: vm.env
      });
      synchronizer.sync();
      this.parentElement().removeChild(marker);
    } // Run now-updated updating opcodes


    super.evaluate(vm);
  }

  vmForInsertion(nextSibling) {
    let {
      bounds,
      state,
      runtime
    } = this;
    let elementStack = NewElementBuilder.forInitialRender(runtime.env, {
      element: bounds.parentElement(),
      nextSibling
    });
    return state.resume(runtime, elementStack);
  }

}

class UpdatingVMFrame {
  constructor(ops, exceptionHandler) {
    this.ops = ops;
    this.exceptionHandler = exceptionHandler;
    this.current = ops.head();
  }

  goto(op) {
    this.current = op;
  }

  nextStatement() {
    let {
      current,
      ops
    } = this;
    if (current) this.current = ops.nextNode(current);
    return current;
  }

  handleException() {
    if (this.exceptionHandler) {
      this.exceptionHandler.handleException();
    }
  }

}

class RenderResultImpl {
  constructor(env, updating, bounds, drop) {
    this.env = env;
    this.updating = updating;
    this.bounds = bounds;
    this.drop = drop;
    associate(this, drop);
  }

  rerender({
    alwaysRevalidate = false
  } = {
    alwaysRevalidate: false
  }) {
    let {
      env,
      updating
    } = this;
    let vm = new UpdatingVM(env, {
      alwaysRevalidate
    });
    vm.execute(updating, this);
  }

  parentElement() {
    return this.bounds.parentElement();
  }

  firstNode() {
    return this.bounds.firstNode();
  }

  lastNode() {
    return this.bounds.lastNode();
  }

  handleException() {
    throw 'this should never happen';
  }

  [DESTROY]() {
    clear(this.bounds);
  } // compat, as this is a user-exposed API


  destroy() {
    inTransaction(this.env, () => {
      legacySyncDestroy(this, this.env);
      asyncDestroy(this, this.env);
    });
  }

}

class Stack {
  constructor(vec = []) {
    this.vec = vec;
  }

  clone() {
    return new Stack(this.vec.slice());
  }

  sliceFrom(start) {
    return new Stack(this.vec.slice(start));
  }

  slice(start, end) {
    return new Stack(this.vec.slice(start, end));
  }

  copy(from, to) {
    this.vec[to] = this.vec[from];
  } // TODO: how to model u64 argument?


  writeRaw(pos, value) {
    // TODO: Grow?
    this.vec[pos] = value;
  } // TODO: partially decoded enum?


  getRaw(pos) {
    return this.vec[pos];
  }

  reset() {
    this.vec.length = 0;
  }

  len() {
    return this.vec.length;
  }

}

class InnerStack {
  constructor(inner = new Stack(), js = []) {
    this.inner = inner;
    this.js = js;
  }

  slice(start, end) {
    let inner;

    if (typeof start === 'number' && typeof end === 'number') {
      inner = this.inner.slice(start, end);
    } else if (typeof start === 'number' && end === undefined) {
      inner = this.inner.sliceFrom(start);
    } else {
      inner = this.inner.clone();
    }

    return new InnerStack(inner, this.js.slice(start, end));
  }

  sliceInner(start, end) {
    let out = [];

    if (start === -1) {
      return out;
    }

    for (let i = start; i < end; i++) {
      out.push(this.get(i));
    }

    return out;
  }

  copy(from, to) {
    this.inner.copy(from, to);
  }

  write(pos, value) {
    switch (typeof value) {
      case 'boolean':
      case 'undefined':
        this.writeRaw(pos, encodeImmediate(value));
        break;

      case 'number':
        if (isSmallInt(value)) {
          this.writeRaw(pos, encodeImmediate(value));
          break;
        }

      case 'object':
        if (value === null) {
          this.writeRaw(pos, encodeImmediate(value));
          break;
        }

      default:
        this.writeJs(pos, value);
    }
  }

  writeJs(pos, value) {
    let idx = this.js.length;
    this.js.push(value);
    this.inner.writeRaw(pos, encodeHandle(idx));
  }

  writeRaw(pos, value) {
    this.inner.writeRaw(pos, value);
  }

  get(pos) {
    let value = this.inner.getRaw(pos);

    if (isHandle(value)) {
      return this.js[decodeHandle(value)];
    } else {
      return decodeImmediate(value);
    }
  }

  reset() {
    this.inner.reset();
    this.js.length = 0;
  }

  get length() {
    return this.inner.len();
  }

}
class EvaluationStackImpl {
  // fp -> sp
  constructor(stack, registers) {
    this.stack = stack;
    this[REGISTERS] = registers;
  }

  static restore(snapshot) {
    let stack = new InnerStack();

    for (let i = 0; i < snapshot.length; i++) {
      stack.write(i, snapshot[i]);
    }

    return new this(stack, initializeRegistersWithSP(snapshot.length - 1));
  }

  push(value) {
    this.stack.write(++this[REGISTERS][$sp], value);
  }

  pushJs(value) {
    this.stack.writeJs(++this[REGISTERS][$sp], value);
  }

  pushRaw(value) {
    this.stack.writeRaw(++this[REGISTERS][$sp], value);
  }

  dup(position = this[REGISTERS][$sp]) {
    this.stack.copy(position, ++this[REGISTERS][$sp]);
  }

  copy(from, to) {
    this.stack.copy(from, to);
  }

  pop(n = 1) {
    let top = this.stack.get(this[REGISTERS][$sp]);
    this[REGISTERS][$sp] -= n;
    return top;
  }

  peek(offset = 0) {
    return this.stack.get(this[REGISTERS][$sp] - offset);
  }

  get(offset, base = this[REGISTERS][$fp]) {
    return this.stack.get(base + offset);
  }

  set(value, offset, base = this[REGISTERS][$fp]) {
    this.stack.write(base + offset, value);
  }

  slice(start, end) {
    return this.stack.slice(start, end);
  }

  sliceArray(start, end) {
    return this.stack.sliceInner(start, end);
  }

  capture(items) {
    let end = this[REGISTERS][$sp] + 1;
    let start = end - items;
    return this.stack.sliceInner(start, end);
  }

  reset() {
    this.stack.reset();
  }

  toArray() {
    console.log(this[REGISTERS]);
    return this.stack.sliceInner(this[REGISTERS][$fp], this[REGISTERS][$sp] + 1);
  }

}

var _a$3, _b;

class Stacks {
  constructor() {
    this.scope = new StackImpl();
    this.dynamicScope = new StackImpl();
    this.updating = new StackImpl();
    this.cache = new StackImpl();
    this.list = new StackImpl();
  }

}

class VM {
  /**
   * End of migrated.
   */
  constructor(runtime, {
    pc,
    scope,
    dynamicScope,
    stack
  }, elementStack) {
    this.runtime = runtime;
    this.elementStack = elementStack;
    this[_a$3] = new Stacks();
    this[_b] = new StackImpl();
    this.s0 = null;
    this.s1 = null;
    this.t0 = null;
    this.t1 = null;
    this.v0 = null;
    let evalStack = EvaluationStackImpl.restore(stack);
    evalStack[REGISTERS][$pc] = pc;
    evalStack[REGISTERS][$sp] = stack.length - 1;
    evalStack[REGISTERS][$fp] = -1;
    this[HEAP] = this.program.heap;
    this[CONSTANTS] = this.program.constants;
    this.elementStack = elementStack;
    this[STACKS].scope.push(scope);
    this[STACKS].dynamicScope.push(dynamicScope);
    this[ARGS] = new VMArgumentsImpl();
    this[INNER_VM] = new LowLevelVM(evalStack, this[HEAP], runtime.program, {
      debugBefore: opcode => {
        return APPEND_OPCODES.debugBefore(this, opcode);
      },
      debugAfter: state => {
        APPEND_OPCODES.debugAfter(this, state);
      }
    }, evalStack[REGISTERS]);
    this.destructor = {};
    this[DESTRUCTOR_STACK].push(this.destructor);
  }

  get stack() {
    return this[INNER_VM].stack;
  }
  /* Registers */


  get pc() {
    return this[INNER_VM].fetchRegister($pc);
  } // Fetch a value from a register onto the stack


  fetch(register) {
    this.stack.push(this.fetchValue(register));
  } // Load a value from the stack into a register


  load(register) {
    let value = this.stack.pop();
    this.loadValue(register, value);
  }

  fetchValue(register) {
    if (isLowLevelRegister(register)) {
      return this[INNER_VM].fetchRegister(register);
    }

    switch (register) {
      case $s0:
        return this.s0;

      case $s1:
        return this.s1;

      case $t0:
        return this.t0;

      case $t1:
        return this.t1;

      case $v0:
        return this.v0;
    }
  } // Load a value into a register


  loadValue(register, value) {
    if (isLowLevelRegister(register)) {
      this[INNER_VM].loadRegister(register, value);
    }

    switch (register) {
      case $s0:
        this.s0 = value;
        break;

      case $s1:
        this.s1 = value;
        break;

      case $t0:
        this.t0 = value;
        break;

      case $t1:
        this.t1 = value;
        break;

      case $v0:
        this.v0 = value;
        break;
    }
  }
  /**
   * Migrated to Inner
   */
  // Start a new frame and save $ra and $fp on the stack


  pushFrame() {
    this[INNER_VM].pushFrame();
  } // Restore $ra, $sp and $fp


  popFrame() {
    this[INNER_VM].popFrame();
  } // Jump to an address in `program`


  goto(offset) {
    this[INNER_VM].goto(offset);
  } // Save $pc into $ra, then jump to a new address in `program` (jal in MIPS)


  call(handle) {
    this[INNER_VM].call(handle);
  } // Put a specific `program` address in $ra


  returnTo(offset) {
    this[INNER_VM].returnTo(offset);
  } // Return to the `program` address stored in $ra


  return() {
    this[INNER_VM].return();
  }

  get program() {
    return this.runtime.program;
  }

  get env() {
    return this.runtime.env;
  }

  captureState(args, pc = this[INNER_VM].fetchRegister($pc)) {
    return {
      pc,
      dynamicScope: this.dynamicScope(),
      scope: this.scope(),
      stack: this.stack.capture(args)
    };
  }

  beginCacheGroup() {
    this[STACKS].cache.push(this.updating().tail());
  }

  commitCacheGroup() {
    let END = new LabelOpcode('END');
    let opcodes = this.updating();
    let marker = this[STACKS].cache.pop();
    let head = marker ? opcodes.nextNode(marker) : opcodes.head();
    let tail = opcodes.tail();
    let tag = combineSlice(new ListSlice(head, tail));
    let guard = new JumpIfNotModifiedOpcode(tag, END);
    opcodes.insertBefore(guard, head);
    opcodes.append(new DidModifyOpcode(guard));
    opcodes.append(END);
  }

  enter(args) {
    let updating = new LinkedList();
    let state = this.capture(args);
    let block = this.elements().pushUpdatableBlock();
    let tryOpcode = new TryOpcode(state, this.runtime, block, updating);
    this.didEnter(tryOpcode);
  }

  iterate(memo, value) {
    let stack = this.stack;
    stack.push(value);
    stack.push(memo);
    let state = this.capture(2);
    let block = this.elements().pushUpdatableBlock(); // let ip = this.ip;
    // this.ip = end + 4;
    // this.frames.push(ip);

    return new TryOpcode(state, this.runtime, block, new LinkedList());
  }

  enterItem(key, opcode) {
    this.listBlock().map.set(key, opcode);
    this.didEnter(opcode);
  }

  enterList(offset) {
    let updating = new LinkedList();
    let addr = this[INNER_VM].target(offset);
    let state = this.capture(0, addr);
    let list = this.elements().pushBlockList(updating);
    let artifacts = this.stack.peek().artifacts;
    let opcode = new ListBlockOpcode(state, this.runtime, list, updating, artifacts);
    this[STACKS].list.push(opcode);
    this.didEnter(opcode);
  }

  didEnter(opcode) {
    this.associateDestructor(destructor(opcode));
    this[DESTRUCTOR_STACK].push(opcode);
    this.updateWith(opcode);
    this.pushUpdating(opcode.children);
  }

  exit() {
    this[DESTRUCTOR_STACK].pop();
    this.elements().popBlock();
    this.popUpdating();
    let parent = this.updating().tail();
    parent.didInitializeChildren();
  }

  exitList() {
    this.exit();
    this[STACKS].list.pop();
  }

  pushUpdating(list = new LinkedList()) {
    this[STACKS].updating.push(list);
  }

  popUpdating() {
    return this[STACKS].updating.pop();
  }

  updateWith(opcode) {
    this.updating().append(opcode);
  }

  listBlock() {
    return this[STACKS].list.current;
  }

  associateDestructor(child) {
    if (!isDrop(child)) return;
    let parent = this[DESTRUCTOR_STACK].current;
    associateDestructor(parent, child);
  }

  associateDestroyable(child) {
    this.associateDestructor(destructor(child));
  }

  tryUpdating() {
    return this[STACKS].updating.current;
  }

  updating() {
    return this[STACKS].updating.current;
  }

  elements() {
    return this.elementStack;
  }

  scope() {
    return this[STACKS].scope.current;
  }

  dynamicScope() {
    return this[STACKS].dynamicScope.current;
  }

  pushChildScope() {
    this[STACKS].scope.push(this.scope().child());
  }

  pushDynamicScope() {
    let child = this.dynamicScope().child();
    this[STACKS].dynamicScope.push(child);
    return child;
  }

  pushRootScope(size) {
    let scope = ScopeImpl.sized(size);
    this[STACKS].scope.push(scope);
    return scope;
  }

  pushScope(scope) {
    this[STACKS].scope.push(scope);
  }

  popScope() {
    this[STACKS].scope.pop();
  }

  popDynamicScope() {
    this[STACKS].dynamicScope.pop();
  } /// SCOPE HELPERS


  getSelf() {
    return this.scope().getSelf();
  }

  referenceForSymbol(symbol) {
    return this.scope().getSymbol(symbol);
  } /// EXECUTION


  execute(initialize) {

    if (initialize) initialize(this);
    let result;

    try {
      while (true) {
        result = this.next();
        if (result.done) break;
      }
    } finally {
      // If any existing blocks are open, due to an error or something like
      // that, we need to close them all and clean things up properly.
      let elements = this.elements();

      while (elements.hasBlocks) {
        elements.popBlock();
      }
    }

    return result.value;
  }

  next() {
    let {
      env,
      elementStack
    } = this;
    let opcode = this[INNER_VM].nextStatement();
    let result;

    if (opcode !== null) {
      this[INNER_VM].evaluateOuter(opcode, this);
      result = {
        done: false,
        value: null
      };
    } else {
      // Unload the stack
      this.stack.reset();
      result = {
        done: true,
        value: new RenderResultImpl(env, this.popUpdating(), elementStack.popBlock(), this.destructor)
      };
    }

    return result;
  }

  bindDynamicScope(names) {
    let scope = this.dynamicScope();

    for (let i = names.length - 1; i >= 0; i--) {
      let name = this[CONSTANTS].getString(names[i]);
      scope.set(name, this.stack.pop());
    }
  }

}
_a$3 = STACKS, _b = DESTRUCTOR_STACK;

function vmState(pc, scope = ScopeImpl.root(UNDEFINED_REFERENCE$1, 0), dynamicScope) {
  return {
    pc,
    scope,
    dynamicScope,
    stack: []
  };
}

function initJIT(context) {
  return (runtime, state, builder) => new JitVM(runtime, state, builder, context);
}

class JitVM extends VM {
  constructor(runtime, state, elementStack, context) {
    super(runtime, state, elementStack);
    this.context = context;
    this.resume = initJIT(this.context);
  }

  static initial(runtime, context, {
    handle,
    self,
    dynamicScope,
    treeBuilder
  }) {
    let scopeSize = runtime.program.heap.scopesizeof(handle);
    let scope = ScopeImpl.root(self, scopeSize);
    let state = vmState(runtime.program.heap.getaddr(handle), scope, dynamicScope);
    let vm = initJIT(context)(runtime, state, treeBuilder);
    vm.pushUpdating();
    return vm;
  }

  static empty(runtime, {
    handle,
    treeBuilder,
    dynamicScope
  }, context) {
    let vm = initJIT(context)(runtime, vmState(runtime.program.heap.getaddr(handle), ScopeImpl.root(UNDEFINED_REFERENCE$1, 0), dynamicScope), treeBuilder);
    vm.pushUpdating();
    return vm;
  }

  capture(args, pc = this[INNER_VM].fetchRegister($pc)) {
    return new ResumableVMStateImpl(this.captureState(args, pc), this.resume);
  }

  compile(block) {
    let handle = unwrapHandle(block.compile(this.context));
    return handle;
  }

}

class TemplateIteratorImpl {
  constructor(vm) {
    this.vm = vm;
  }

  next() {
    return this.vm.next();
  }

  sync() {
    return renderSync(this.vm.runtime.env, this);
  }

}

function renderSync(env, iterator) {
  env.begin();
  let iteratorResult;

  do {
    iteratorResult = iterator.next();
  } while (!iteratorResult.done);

  let result = iteratorResult.value;
  env.commit();
  return result;
}

function renderInvocation(vm, invocation, definition, args) {
  // Get a list of tuples of argument names and references, like
  // [['title', reference], ['name', reference]]
  const argList = Object.keys(args).map(key => [key, args[key]]);
  const blockNames = ['main', 'else', 'attrs']; // Prefix argument names with `@` symbol

  const argNames = argList.map(([name]) => `@${name}`);
  vm.pushFrame(); // Push blocks on to the stack, three stack values per block

  for (let i = 0; i < 3 * blockNames.length; i++) {
    vm.stack.push(null);
  }

  vm.stack.push(null); // For each argument, push its backing reference on to the stack

  argList.forEach(([, reference]) => {
    vm.stack.push(reference);
  }); // Configure VM based on blocks and args just pushed on to the stack.

  vm[ARGS].setup(vm.stack, argNames, blockNames, 0, true); // Needed for the Op.Main opcode: arguments, component invocation object, and
  // component definition.

  vm.stack.push(vm[ARGS]);
  vm.stack.push(invocation);
  vm.stack.push(definition);
  return new TemplateIteratorImpl(vm);
}
function renderJitComponent(runtime, treeBuilder, context, main, name, args = {}, dynamicScope = new DefaultDynamicScope()) {
  let vm = JitVM.empty(runtime, {
    treeBuilder,
    handle: main,
    dynamicScope
  }, context);
  const definition = resolveComponent(vm.runtime.resolver, name);
  const {
    manager,
    state
  } = definition;
  const capabilities = capabilityFlagsFrom(manager.getCapabilities(state));
  let invocation;

  if (hasStaticLayoutCapability(capabilities, manager)) {
    let layout = manager.getJitStaticLayout(state, vm.runtime.resolver);
    let handle = unwrapHandle(layout.compile(context));

    if (Array.isArray(handle)) {
      let error = handle[0];
      throw new Error(`Compile Error: ${error.problem} ${error.span.start}..${error.span.end} :: TODO (thread better)`);
    }

    invocation = {
      handle,
      symbolTable: layout.symbolTable
    };
  } else {
    throw new Error('Cannot invoke components with dynamic layouts as a root component.');
  }

  return renderInvocation(vm, invocation, definition, args);
}

function arr(value) {
  return {
    type: 'array',
    value
  };
}
function strArray(value) {
  return {
    type: 'string-array',
    value
  };
}
function serializable(value) {
  return {
    type: 'serializable',
    value
  };
}
function templateMeta(value) {
  return {
    type: 'template-meta',
    value
  };
}
function other(value) {
  return {
    type: 'other',
    value
  };
}
function label(value) {
  return {
    type: 'label',
    value
  };
}
function prim(operand, type) {
  return {
    type: 'primitive',
    value: {
      primitive: operand,
      type
    }
  };
}

const MINIMAL_CAPABILITIES = {
  dynamicLayout: false,
  dynamicTag: false,
  prepareArgs: false,
  createArgs: false,
  attributeHook: false,
  elementHook: false,
  dynamicScope: false,
  createCaller: false,
  updateHook: false,
  createInstance: false,
  wrapped: false,
  willDestroy: false
};
class DefaultCompileTimeResolverDelegate {
  constructor(inner) {
    this.inner = inner;
  }

  lookupHelper(name, referrer) {
    if (this.inner.lookupHelper) {
      let helper = this.inner.lookupHelper(name, referrer);

      if (helper === undefined) {
        throw new Error(`Unexpected helper (${name} from ${JSON.stringify(referrer)}) (lookupHelper returned undefined)`);
      }

      return helper;
    } else {
      throw new Error(`Can't compile global helper invocations without an implementation of lookupHelper`);
    }
  }

  lookupModifier(name, referrer) {
    if (this.inner.lookupModifier) {
      let modifier = this.inner.lookupModifier(name, referrer);

      if (modifier === undefined) {
        throw new Error(`Unexpected modifier (${name} from ${JSON.stringify(referrer)}) (lookupModifier returned undefined)`);
      }

      return modifier;
    } else {
      throw new Error(`Can't compile global modifier invocations without an implementation of lookupModifier`);
    }
  }

  lookupComponent(name, referrer) {
    if (this.inner.lookupComponent) {
      let component = this.inner.lookupComponent(name, referrer);

      if (component === undefined) {
        throw new Error(`Unexpected component (${name} from ${JSON.stringify(referrer)}) (lookupComponent returned undefined)`);
      }

      return component;
    } else {
      throw new Error(`Can't compile global component invocations without an implementation of lookupComponent`);
    }
  }

  lookupPartial(name, referrer) {
    if (this.inner.lookupPartial) {
      let partial = this.inner.lookupPartial(name, referrer);

      if (partial === undefined) {
        throw new Error(`Unexpected partial (${name} from ${JSON.stringify(referrer)}) (lookupPartial returned undefined)`);
      }

      return partial;
    } else {
      throw new Error(`Can't compile global partial invocations without an implementation of lookupPartial`);
    }
  } // For debugging


  resolve(handle) {
    if (this.inner.resolve) {
      return this.inner.resolve(handle);
    } else {
      throw new Error(`Compile-time debugging requires an implementation of resolve`);
    }
  }

}

function resolveLayoutForTag(tag, {
  resolver,
  meta: {
    referrer
  }
}) {
  let component = resolver.lookupComponent(tag, referrer);
  if (component === null) return component;
  let {
    handle,
    compilable,
    capabilities
  } = component;
  return {
    handle,
    compilable,
    capabilities: capabilities || MINIMAL_CAPABILITIES
  };
}

class InstructionEncoderImpl {
  constructor(buffer) {
    this.buffer = buffer;
    this.size = 0;
  }

  encode(type, machine) {
    if (type > 255
    /* TYPE_SIZE */
    ) {
        throw new Error(`Opcode type over 8-bits. Got ${type}.`);
      }

    let first = type | machine | arguments.length - 2 << 8
    /* ARG_SHIFT */
    ;
    this.buffer.push(first);

    for (let i = 2; i < arguments.length; i++) {
      let op = arguments[i];

      if (typeof op === 'number' && op > 2147483647
      /* MAX_SIZE */
      ) {
          throw new Error(`Operand over 32-bits. Got ${op}.`);
        }

      this.buffer.push(op);
    }

    this.size = this.buffer.length;
  }

  patch(position, target) {
    if (this.buffer[position + 1] === -1) {
      this.buffer[position + 1] = target;
    } else {
      throw new Error('Trying to patch operand in populated slot instead of a reserved slot.');
    }
  }

}

/**
 * Push a reference onto the stack corresponding to a statically known primitive
 * @param value A JavaScript primitive (undefined, null, boolean, number or string)
 */

function PushPrimitiveReference(value) {
  return [PushPrimitive(value), op(31
  /* PrimitiveReference */
  )];
}
/**
 * Push an encoded representation of a JavaScript primitive on the stack
 *
 * @param value A JavaScript primitive (undefined, null, boolean, number or string)
 */

function PushPrimitive(primitive) {
  let p;

  switch (typeof primitive) {
    case 'number':
      if (isSmallInt(primitive)) {
        p = prim(primitive, 0
        /* IMMEDIATE */
        );
      } else {
        p = prim(primitive, 2
        /* NUMBER */
        );
      }

      break;

    case 'string':
      p = prim(primitive, 1
      /* STRING */
      );
      break;

    case 'boolean':
    case 'object': // assume null

    case 'undefined':
      p = prim(primitive, 0
      /* IMMEDIATE */
      );
      break;

    default:
      throw new Error('Invalid primitive passed to pushPrimitive');
  }

  return op(30
  /* Primitive */
  , p);
}
/**
 * Invoke a foreign function (a "helper") based on a statically known handle
 *
 * @param compile.handle A handle
 * @param compile.params An optional list of expressions to compile
 * @param compile.hash An optional list of named arguments (name + expression) to compile
 */

function Call({
  handle,
  params,
  hash
}) {
  return [op(0
  /* PushFrame */
  ), op('SimpleArgs', {
    params,
    hash,
    atNames: false
  }), op(16
  /* Helper */
  , handle), op(1
  /* PopFrame */
  ), op(36
  /* Fetch */
  , $v0)];
}
/**
 * Evaluate statements in the context of new dynamic scope entries. Move entries from the
 * stack into named entries in the dynamic scope, then evaluate the statements, then pop
 * the dynamic scope
 *
 * @param names a list of dynamic scope names
 * @param block a function that returns a list of statements to evaluate
 */

function DynamicScope(names, block) {
  return [op(59
  /* PushDynamicScope */
  ), op(58
  /* BindDynamicScope */
  , strArray(names)), block(), op(60
  /* PopDynamicScope */
  )];
}

/**
 * Yield to a block located at a particular symbol location.
 *
 * @param to the symbol containing the block to yield to
 * @param params optional block parameters to yield to the block
 */

function YieldBlock(to, params) {
  return [op('SimpleArgs', {
    params,
    hash: null,
    atNames: true
  }), op(24
  /* GetBlock */
  , to), op(25
  /* JitSpreadBlock */
  ), op('Option', op('JitCompileBlock')), op(64
  /* InvokeYield */
  ), op(40
  /* PopScope */
  ), op(1
  /* PopFrame */
  )];
}
/**
 * Push an (optional) yieldable block onto the stack. The yieldable block must be known
 * statically at compile time.
 *
 * @param block An optional Compilable block
 */

function PushYieldableBlock(block) {
  return [PushSymbolTable(block && block.symbolTable), op(62
  /* PushBlockScope */
  ), op('PushCompilable', block)];
}
/**
 * Invoke a block that is known statically at compile time.
 *
 * @param block a Compilable block
 */

function InvokeStaticBlock(block) {
  return [op(0
  /* PushFrame */
  ), op('PushCompilable', block), op('JitCompileBlock'), op(2
  /* InvokeVirtual */
  ), op(1
  /* PopFrame */
  )];
}
/**
 * Invoke a static block, preserving some number of stack entries for use in
 * updating.
 *
 * @param block A compilable block
 * @param callerCount A number of stack entries to preserve
 */

function InvokeStaticBlockWithStack(block, callerCount) {
  let {
    parameters
  } = block.symbolTable;
  let calleeCount = parameters.length;
  let count = Math.min(callerCount, calleeCount);

  if (count === 0) {
    return InvokeStaticBlock(block);
  }

  let out = [];
  out.push(op(0
  /* PushFrame */
  ));

  if (count) {
    out.push(op(39
    /* ChildScope */
    ));

    for (let i = 0; i < count; i++) {
      out.push(op(33
      /* Dup */
      , $fp, callerCount - i));
      out.push(op(19
      /* SetVariable */
      , parameters[i]));
    }
  }

  out.push(op('PushCompilable', block));
  out.push(op('JitCompileBlock'));
  out.push(op(2
  /* InvokeVirtual */
  ));

  if (count) {
    out.push(op(40
    /* PopScope */
    ));
  }

  out.push(op(1
  /* PopFrame */
  ));
  return out;
}
function PushSymbolTable(table) {
  if (table) {
    return op(63
    /* PushSymbolTable */
    , serializable(table));
  } else {
    return PushPrimitive(null);
  }
}

function SwitchCases(callback) {
  // Setup the switch DSL
  let clauses = [];
  let count = 0;

  function when(match, callback) {
    clauses.push({
      match,
      callback,
      label: `CLAUSE${count++}`
    });
  } // Call the callback


  callback(when); // Emit the opcodes for the switch

  let out = [op(69
  /* Enter */
  , 2), op(68
  /* AssertSame */
  ), op(32
  /* ReifyU32 */
  ), op('StartLabels')]; // First, emit the jump opcodes. We don't need a jump for the last
  // opcode, since it bleeds directly into its clause.

  for (let clause of clauses.slice(0, -1)) {
    out.push(op(67
    /* JumpEq */
    , label(clause.label), clause.match));
  } // Enumerate the clauses in reverse order. Earlier matches will
  // require fewer checks.


  for (let i = clauses.length - 1; i >= 0; i--) {
    let clause = clauses[i];
    out.push(op('Label', clause.label), op(34
    /* Pop */
    , 2), clause.callback()); // The first match is special: it is placed directly before the END
    // label, so no additional jump is needed at the end of it.

    if (i !== 0) {
      out.push(op(4
      /* Jump */
      , label('END')));
    }
  }

  out.push(op('Label', 'END'), op('StopLabels'), op(70
  /* Exit */
  ));
  return out;
}
/**
 * A convenience for pushing some arguments on the stack and
 * running some code if the code needs to be re-executed during
 * updating execution if some of the arguments have changed.
 *
 * # Initial Execution
 *
 * The `args` function should push zero or more arguments onto
 * the stack and return the number of arguments pushed.
 *
 * The `body` function provides the instructions to execute both
 * during initial execution and during updating execution.
 *
 * Internally, this function starts by pushing a new frame, so
 * that the body can return and sets the return point ($ra) to
 * the ENDINITIAL label.
 *
 * It then executes the `args` function, which adds instructions
 * responsible for pushing the arguments for the block to the
 * stack. These arguments will be restored to the stack before
 * updating execution.
 *
 * Next, it adds the Enter opcode, which marks the current position
 * in the DOM, and remembers the current $pc (the next instruction)
 * as the first instruction to execute during updating execution.
 *
 * Next, it runs `body`, which adds the opcodes that should
 * execute both during initial execution and during updating execution.
 * If the `body` wishes to finish early, it should Jump to the
 * `FINALLY` label.
 *
 * Next, it adds the FINALLY label, followed by:
 *
 * - the Exit opcode, which finalizes the marked DOM started by the
 *   Enter opcode.
 * - the Return opcode, which returns to the current return point
 *   ($ra).
 *
 * Finally, it adds the ENDINITIAL label followed by the PopFrame
 * instruction, which restores $fp, $sp and $ra.
 *
 * # Updating Execution
 *
 * Updating execution for this `replayable` occurs if the `body` added an
 * assertion, via one of the `JumpIf`, `JumpUnless` or `AssertSame` opcodes.
 *
 * If, during updating executon, the assertion fails, the initial VM is
 * restored, and the stored arguments are pushed onto the stack. The DOM
 * between the starting and ending markers is cleared, and the VM's cursor
 * is set to the area just cleared.
 *
 * The return point ($ra) is set to -1, the exit instruction.
 *
 * Finally, the $pc is set to to the instruction saved off by the
 * Enter opcode during initial execution, and execution proceeds as
 * usual.
 *
 * The only difference is that when a `Return` instruction is
 * encountered, the program jumps to -1 rather than the END label,
 * and the PopFrame opcode is not needed.
 */

function Replayable({
  args,
  body
}) {
  // Push the arguments onto the stack. The args() function
  // tells us how many stack elements to retain for re-execution
  // when updating.
  let {
    count,
    actions
  } = args(); // Start a new label frame, to give END and RETURN
  // a unique meaning.

  return [op('StartLabels'), op(0
  /* PushFrame */
  ), // If the body invokes a block, its return will return to
  // END. Otherwise, the return in RETURN will return to END.
  op(6
  /* ReturnTo */
  , label('ENDINITIAL')), actions, // Start a new updating closure, remembering `count` elements
  // from the stack. Everything after this point, and before END,
  // will execute both initially and to update the block.
  //
  // The enter and exit opcodes also track the area of the DOM
  // associated with this block. If an assertion inside the block
  // fails (for example, the test value changes from true to false
  // in an #if), the DOM is cleared and the program is re-executed,
  // restoring `count` elements to the stack and executing the
  // instructions between the enter and exit.
  op(69
  /* Enter */
  , count), // Evaluate the body of the block. The body of the block may
  // return, which will jump execution to END during initial
  // execution, and exit the updating routine.
  body(), // All execution paths in the body should run the FINALLY once
  // they are done. It is executed both during initial execution
  // and during updating execution.
  op('Label', 'FINALLY'), // Finalize the DOM.
  op(70
  /* Exit */
  ), // In initial execution, this is a noop: it returns to the
  // immediately following opcode. In updating execution, this
  // exits the updating routine.
  op(5
  /* Return */
  ), // Cleanup code for the block. Runs on initial execution
  // but not on updating.
  op('Label', 'ENDINITIAL'), op(1
  /* PopFrame */
  ), op('StopLabels')];
}
/**
 * A specialized version of the `replayable` convenience that allows the
 * caller to provide different code based upon whether the item at
 * the top of the stack is true or false.
 *
 * As in `replayable`, the `ifTrue` and `ifFalse` code can invoke `return`.
 *
 * During the initial execution, a `return` will continue execution
 * in the cleanup code, which finalizes the current DOM block and pops
 * the current frame.
 *
 * During the updating execution, a `return` will exit the updating
 * routine, as it can reuse the DOM block and is always only a single
 * frame deep.
 */

function ReplayableIf({
  args,
  ifTrue,
  ifFalse
}) {
  return Replayable({
    args,
    body: () => {
      let out = [// If the conditional is false, jump to the ELSE label.
      op(66
      /* JumpUnless */
      , label('ELSE')), // Otherwise, execute the code associated with the true branch.
      ifTrue(), // We're done, so return. In the initial execution, this runs
      // the cleanup code. In the updating VM, it exits the updating
      // routine.
      op(4
      /* Jump */
      , label('FINALLY')), op('Label', 'ELSE')]; // If the conditional is false, and code associatied ith the
      // false branch was provided, execute it. If there was no code
      // associated with the false branch, jumping to the else statement
      // has no other behavior.

      if (ifFalse) {
        out.push(ifFalse());
      }

      return out;
    }
  });
}

function pushBuilderOp(context, op) {
  let {
    encoder,
    syntax: {
      program: {
        mode,
        constants
      }
    }
  } = context;

  switch (op.op) {
    case "Option"
    /* Option */
    :
      return concat(context, option(op));

    case "Label"
    /* Label */
    :
      return encoder.label(op.op1);

    case "StartLabels"
    /* StartLabels */
    :
      return encoder.startLabels();

    case "StopLabels"
    /* StopLabels */
    :
      return encoder.stopLabels();

    case "JitCompileBlock"
    /* JitCompileBlock */
    :
      return concat(context, jitCompileBlock(mode));

    case "GetComponentLayout"
    /* GetComponentLayout */
    :
      return encoder.push(constants, compileLayoutOpcode(mode), op.op1);

    case "SetBlock"
    /* SetBlock */
    :
      return encoder.push(constants, setBlock(mode), op.op1);

    default:
      return exhausted(op);
  }
}

function option(op) {
  let value = op.op1;
  return value === null ? NONE : value;
}

function compileLayoutOpcode(mode) {
  return mode === "aot"
  /* aot */
  ? 94
  /* GetAotComponentLayout */
  : 95
  /* GetJitComponentLayout */
  ;
}

function jitCompileBlock(mode) {
  return mode === "jit"
  /* jit */
  ? op(61
  /* CompileBlock */
  ) : NONE;
}

function setBlock(mode) {
  return mode === "aot"
  /* aot */
  ? 20
  /* SetAotBlock */
  : 21
  /* SetJitBlock */
  ;
}

function pushCompileOp(context, action) {
  concatStatements(context, compileOp(context, action));
}

function compileOp(context, action) {
  switch (action.op) {
    case "CompileBlock"
    /* CompileBlock */
    :
      return CompileBlockOp(context, action);

    case "CompileInline"
    /* CompileInline */
    :
      return CompileInlineOp(context, action);

    case "InvokeStatic"
    /* InvokeStatic */
    :
      return InvokeStatic(context.syntax, action);

    case "Args"
    /* Args */
    :
      return CompileArgs(action.op1);

    case "PushCompilable"
    /* PushCompilable */
    :
      return PushCompilable(action.op1, context.syntax);

    case "DynamicComponent"
    /* DynamicComponent */
    :
      return DynamicComponent(context, action);

    case "IfResolvedComponent"
    /* IfResolvedComponent */
    :
      return IfResolvedComponent(context, action);

    default:
      return exhausted(action);
  }
}

function CompileBlockOp(context, op) {
  return compileBlock(op.op1, context);
}

function CompileInlineOp(context, op) {
  let {
    inline,
    ifUnhandled
  } = op.op1;
  let returned = compileInline(inline, context);

  if (isHandled(returned)) {
    return returned;
  } else {
    return ifUnhandled(inline);
  }
}

function InvokeStatic(context, action) {
  let compilable = action.op1;

  if (context.program.mode === "aot"
  /* aot */
  ) {
      let handle = compilable.compile(context);

      if (typeof handle !== 'number') {
        return op('Error', {
          problem: 'Invalid block',
          start: 0,
          end: 0
        });
      } // If the handle for the invoked component is not yet known (for example,
      // because this is a recursive invocation and we're still compiling), push a
      // function that will produce the correct handle when the heap is
      // serialized.


      if (handle === PLACEHOLDER_HANDLE) {
        return op(3
        /* InvokeStatic */
        , () => compilable.compile(context));
      } else {
        return op(3
        /* InvokeStatic */
        , handle);
      }
    } else {
    return [op(29
    /* Constant */
    , other(action.op1)), op(61
    /* CompileBlock */
    ), op(2
    /* InvokeVirtual */
    )];
  }
}

function DynamicComponent(context, action) {
  let {
    definition,
    attrs,
    params,
    args,
    blocks,
    atNames
  } = action.op1;
  let attrsBlock = attrs && attrs.length > 0 ? compilableBlock(attrs, context.meta) : null;
  let compiled = Array.isArray(blocks) || blocks === null ? namedBlocks(blocks, context.meta) : blocks;
  return InvokeDynamicComponent(context.meta, {
    definition,
    attrs: attrsBlock,
    params,
    hash: args,
    atNames,
    blocks: compiled
  });
}

function IfResolvedComponent(context, action) {
  let {
    name,
    attrs,
    blocks,
    staticTemplate,
    dynamicTemplate,
    orElse
  } = action.op1;
  let component = resolveLayoutForTag(name, {
    resolver: context.syntax.program.resolverDelegate,
    meta: context.meta
  });
  let {
    meta
  } = context;

  if (component !== null) {
    let {
      handle,
      capabilities,
      compilable
    } = component;
    let attrsBlock = compilableBlock(attrs, meta);
    let compilableBlocks = namedBlocks(blocks, meta);

    if (compilable !== null) {
      return staticTemplate(handle, capabilities, compilable, {
        attrs: attrsBlock,
        blocks: compilableBlocks
      });
    } else {
      return dynamicTemplate(handle, capabilities, {
        attrs: attrsBlock,
        blocks: compilableBlocks
      });
    }
  } else if (orElse) {
    return orElse();
  } else {
    throw new Error(`Compile Error: Cannot find component ${name}`);
  }
}

function PushCompilable(block, context) {
  if (block === null) {
    return PushPrimitive(null);
  } else if (context.program.mode === "aot"
  /* aot */
  ) {
      let compiled = block.compile(context);

      if (typeof compiled !== 'number') {
        return op('Error', {
          problem: 'Compile Error (TODO: thread better)',
          start: 0,
          end: 0
        });
      }

      return PushPrimitive(compiled);
    } else {
    return op(29
    /* Constant */
    , other(block));
  }
}

function pushOp(encoder, constants, op) {
  if (op.op3 !== undefined) {
    encoder.push(constants, op.op, op.op1, op.op2, op.op3);
  } else if (op.op2 !== undefined) {
    encoder.push(constants, op.op, op.op1, op.op2);
  } else if (op.op1 !== undefined) {
    encoder.push(constants, op.op, op.op1);
  } else {
    encoder.push(constants, op.op);
  }
}

class Compilers {
  constructor() {
    this.names = {};
    this.funcs = [];
  }

  add(name, func) {
    this.names[name] = this.funcs.push(func) - 1;
  }

  compile(sexp, meta) {
    let name = sexp[0];
    let index = this.names[name];
    let func = this.funcs[index];
    return func(sexp, meta);
  }

}

const EXPRESSIONS = new Compilers();
EXPRESSIONS.add(32
/* Concat */
, ([, parts]) => {
  let out = [];

  for (let part of parts) {
    out.push(op('Expr', part));
  }

  out.push(op(28
  /* Concat */
  , parts.length));
  return out;
});
EXPRESSIONS.add(31
/* Call */
, ([, start, offset, name, params, hash], meta) => {
  // TODO: triage this in the WF compiler
  if (isComponent(name, meta)) {
    if (!params || params.length === 0) {
      return op('Error', {
        problem: 'component helper requires at least one argument',
        start: start,
        end: start + offset
      });
    }

    let [definition, ...restArgs] = params;
    return curryComponent({
      definition,
      params: restArgs,
      hash,
      atNames: false
    }, meta.referrer);
  }

  let nameOrError = expectString(name, meta, 'Expected call head to be a string');

  if (typeof nameOrError !== 'string') {
    return nameOrError;
  }

  return op('IfResolved', {
    kind: "Helper"
    /* Helper */
    ,
    name: nameOrError,
    andThen: handle => Call({
      handle,
      params,
      hash
    }),
    span: {
      start,
      end: start + offset
    }
  });
});

function isComponent(expr, meta) {
  if (!Array.isArray(expr)) {
    return false;
  }

  if (expr[0] === 27
  /* GetPath */
  ) {
      let head = expr[1];

      if (head[0] === 26
      /* GetContextualFree */
      && meta.upvars && meta.upvars[head[1]] === 'component') {
        return true;
      } else {
        return false;
      }
    }

  return false;
}

EXPRESSIONS.add(24
/* GetSymbol */
, ([, head]) => [op(22
/* GetVariable */
, head)]);
EXPRESSIONS.add(27
/* GetPath */
, ([, head, tail]) => {
  return [op('Expr', head), ...tail.map(p => op(23
  /* GetProperty */
  , p))];
});
EXPRESSIONS.add(25
/* GetFree */
, ([, head]) => op('ResolveFree', head));
EXPRESSIONS.add(26
/* GetContextualFree */
, ([, head, context]) => op('ResolveContextualFree', {
  freeVar: head,
  context
}));
EXPRESSIONS.add(30
/* Undefined */
, () => PushPrimitiveReference(undefined));
EXPRESSIONS.add(28
/* HasBlock */
, ([, block]) => {
  return [op('Expr', block), op(26
  /* HasBlock */
  )];
});
EXPRESSIONS.add(29
/* HasBlockParams */
, ([, block]) => [op('Expr', block), op(25
/* JitSpreadBlock */
), op('JitCompileBlock'), op(27
/* HasBlockParams */
)]);

function pushResolutionOp(encoder, context, operation, constants) {
  switch (operation.op) {
    case "SimpleArgs"
    /* SimpleArgs */
    :
      concatExpressions(encoder, context, compileSimpleArgs(operation.op1.params, operation.op1.hash, operation.op1.atNames), constants);
      break;

    case "Expr"
    /* Expr */
    :
      concatExpressions(encoder, context, expr(operation.op1, context.meta), constants);
      break;

    case "IfResolved"
    /* IfResolved */
    :
      {
        concatExpressions(encoder, context, ifResolved(context, operation), constants);
        break;
      }

    case "ResolveFree"
    /* ResolveFree */
    :
      {
        throw new Error('Unimplemented HighLevelResolutionOpcode.ResolveFree');
      }

    case "ResolveContextualFree"
    /* ResolveContextualFree */
    :
      {
        let {
          freeVar,
          context: expressionContext
        } = operation.op1;

        if (context.meta.asPartial) {
          let name = context.meta.upvars[freeVar];
          concatExpressions(encoder, context, [op(105
          /* ResolveMaybeLocal */
          , name)], constants);
          break;
        }

        switch (expressionContext) {
          case "Expression"
          /* Expression */
          :
            {
              // in classic mode, this is always a this-fallback
              let name = context.meta.upvars[freeVar];
              concatExpressions(encoder, context, [op(22
              /* GetVariable */
              , 0), op(23
              /* GetProperty */
              , name)], constants);
              break;
            }

          case "AppendSingleId"
          /* AppendSingleId */
          :
            {
              let resolver = context.syntax.program.resolverDelegate;
              let name = context.meta.upvars[freeVar];
              let resolvedHelper = resolver.lookupHelper(name, context.meta.referrer);
              let expressions;

              if (resolvedHelper) {
                expressions = Call({
                  handle: resolvedHelper,
                  params: null,
                  hash: null
                });
              } else {
                // in classic mode, this is always a this-fallback
                expressions = [op(22
                /* GetVariable */
                , 0), op(23
                /* GetProperty */
                , name)];
              }

              concatExpressions(encoder, context, expressions, constants);
              break;
            }

          default:
            throw new Error(`unimplemented: Can't evaluate expression in context ${expressionContext}`);
        }

        break;
      }

    default:
      return exhausted(operation);
  }
}
function expr(expression, meta) {
  if (Array.isArray(expression)) {
    return EXPRESSIONS.compile(expression, meta);
  } else {
    return [PushPrimitive(expression), op(31
    /* PrimitiveReference */
    )];
  }
}
function compileSimpleArgs(params, hash, atNames) {
  let out = [];
  let {
    count,
    actions
  } = CompilePositional(params);
  out.push(actions);
  let flags = count << 4;
  if (atNames) flags |= 0b1000;
  let names = EMPTY_ARRAY;

  if (hash) {
    names = hash[0];
    let val = hash[1];

    for (let i = 0; i < val.length; i++) {
      out.push(op('Expr', val[i]));
    }
  }

  out.push(op(84
  /* PushArgs */
  , strArray(names), strArray(EMPTY_ARRAY), flags));
  return out;
}

function ifResolved(context, {
  op1
}) {
  let {
    kind,
    name,
    andThen,
    orElse,
    span
  } = op1;
  let resolved = resolve(context.syntax.program.resolverDelegate, kind, name, context.meta.referrer);

  if (resolved !== null) {
    return andThen(resolved);
  } else if (orElse) {
    return orElse();
  } else {
    return error(`Unexpected ${kind} ${name}`, span.start, span.end);
  }
}

function resolve(resolver, kind, name, referrer) {
  switch (kind) {
    case "Modifier"
    /* Modifier */
    :
      return resolver.lookupModifier(name, referrer);

    case "Helper"
    /* Helper */
    :
      return resolver.lookupHelper(name, referrer);

    case "ComponentDefinition"
    /* ComponentDefinition */
    :
      {
        let component = resolver.lookupComponent(name, referrer);
        return component && component.handle;
      }
  }
}

const NONE = {
  'no-action': true
};
const UNHANDLED = {
  'not-handled': true
};
function isNoAction(actions) {
  return actions && !!actions['no-action'];
}
function isHandled(actions) {
  return !actions || !actions['not-handled'];
}
function concat(context, action) {
  if (isNoAction(action)) {
    return;
  } else if (Array.isArray(action)) {
    for (let item of action) {
      concat(context, item);
    }
  } else if (action.type === 'Simple') {
    pushBuilderOp(context, action);
  } else {
    pushOp(context.encoder, context.syntax.program.constants, action);
  }
}
function concatExpressions(encoder, context, action, constants) {
  if (isNoAction(action)) {
    return;
  } else if (Array.isArray(action)) {
    for (let item of action) {
      concatExpressions(encoder, context, item, constants);
    }
  } else if (action.type === 'Number') {
    pushOp(encoder, constants, action);
  } else if (action.type === 'Resolution') {
    pushResolutionOp(encoder, context, action, constants);
  } else if (action.type === 'Simple') {
    pushBuilderOp(context, action);
  } else if (action.type === 'Error') {
    encoder.error({
      problem: action.op1.problem,
      span: {
        start: action.op1.start,
        end: action.op1.end
      }
    });
  } else {
    throw assertNever(action, 'unexpected action kind');
  }
}
function concatStatements(context, action) {
  if (isNoAction(action)) {
    return;
  } else if (Array.isArray(action)) {
    for (let item of action) {
      concatStatements(context, item);
    }
  } else if (action.type === 'Number') {
    pushOp(context.encoder, context.syntax.program.constants, action);
  } else {
    if (action.type === 'Compile') {
      pushCompileOp(context, action);
    } else if (action.type === 'Resolution') {
      pushResolutionOp(context.encoder, context, action, context.syntax.program.constants);
    } else if (action.type === 'Simple') {
      pushBuilderOp(context, action);
    } else if (action.type === 'Error') ; else {
      throw assertNever(action, `unexpected action type`);
    }
  }
}

function populateBuiltins(blocks, inlines) {
  blocks.add('if', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #if requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 1,
          actions: [op('Expr', params[0]), op(71
          /* ToBoolean */
          )]
        };
      },

      ifTrue() {
        return InvokeStaticBlock(blocks.get('default'));
      },

      ifFalse() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else'));
        } else {
          return NONE;
        }
      }

    });
  });
  blocks.add('unless', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #unless requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 1,
          actions: [op('Expr', params[0]), op(71
          /* ToBoolean */
          )]
        };
      },

      ifTrue() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else'));
        } else {
          return NONE;
        }
      },

      ifFalse() {
        return InvokeStaticBlock(blocks.get('default'));
      }

    });
  });
  blocks.add('with', (params, _hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #with requires a single argument`);
    }

    return ReplayableIf({
      args() {
        return {
          count: 2,
          actions: [op('Expr', params[0]), op(33
          /* Dup */
          , $sp, 0), op(71
          /* ToBoolean */
          )]
        };
      },

      ifTrue() {
        return InvokeStaticBlockWithStack(blocks.get('default'), 1);
      },

      ifFalse() {
        if (blocks.has('else')) {
          return InvokeStaticBlock(blocks.get('else'));
        } else {
          return NONE;
        }
      }

    });
  });
  blocks.add('let', (params, _hash, blocks) => {
    if (!params) {
      return error('let requires arguments', 0, 0);
    }

    let {
      count,
      actions
    } = CompilePositional(params);
    return [actions, InvokeStaticBlockWithStack(blocks.get('default'), count)];
  });
  blocks.add('each', (params, hash, blocks) => {
    return Replayable({
      args() {
        let actions;

        if (hash && hash[0][0] === 'key') {
          actions = [op('Expr', hash[1][0])];
        } else {
          actions = [PushPrimitiveReference(null)];
        }

        actions.push(op('Expr', params[0]));
        return {
          count: 2,
          actions
        };
      },

      body() {
        let out = [op(74
        /* PutIterator */
        ), op(66
        /* JumpUnless */
        , label('ELSE')), op(0
        /* PushFrame */
        ), op(33
        /* Dup */
        , $fp, 1), op(6
        /* ReturnTo */
        , label('ITER')), op(72
        /* EnterList */
        , label('BODY')), op('Label', 'ITER'), op(75
        /* Iterate */
        , label('BREAK')), op('Label', 'BODY'), InvokeStaticBlockWithStack(blocks.get('default'), 2), op(34
        /* Pop */
        , 2), op(4
        /* Jump */
        , label('FINALLY')), op('Label', 'BREAK'), op(73
        /* ExitList */
        ), op(1
        /* PopFrame */
        ), op(4
        /* Jump */
        , label('FINALLY')), op('Label', 'ELSE')];

        if (blocks.has('else')) {
          out.push(InvokeStaticBlock(blocks.get('else')));
        }

        return out;
      }

    });
  });
  blocks.add('in-element', (params, hash, blocks) => {
    if (!params || params.length !== 1) {
      throw new Error(`SYNTAX ERROR: #in-element requires a single argument`);
    }

    return ReplayableIf({
      args() {
        let [keys, values] = hash;
        let actions = [];

        for (let i = 0; i < keys.length; i++) {
          let key = keys[i];

          if (key === 'guid' || key === 'insertBefore') {
            actions.push(op('Expr', values[i]));
          } else {
            throw new Error(`SYNTAX ERROR: #in-element does not take a \`${keys[0]}\` option`);
          }
        }

        actions.push(op('Expr', params[0]), op(33
        /* Dup */
        , $sp, 0));
        return {
          count: 4,
          actions
        };
      },

      ifTrue() {
        return [op(50
        /* PushRemoteElement */
        ), InvokeStaticBlock(blocks.get('default')), op(56
        /* PopRemoteElement */
        )];
      }

    });
  });
  blocks.add('-with-dynamic-vars', (_params, hash, blocks) => {
    if (hash) {
      let [names, expressions] = hash;
      let {
        actions
      } = CompilePositional(expressions);
      return [actions, DynamicScope(names, () => {
        return InvokeStaticBlock(blocks.get('default'));
      })];
    } else {
      return InvokeStaticBlock(blocks.get('default'));
    }
  });
  blocks.add('component', (_params, hash, blocks, context) => {
    let tag = _params[0];

    if (typeof tag === 'string') {
      let returned = StaticComponentHelper(context, _params[0], hash, blocks.get('default'));
      if (isHandled(returned)) return returned;
    }

    let [definition, ...params] = _params;
    return op('DynamicComponent', {
      definition,
      attrs: null,
      params,
      args: hash,
      atNames: false,
      blocks
    });
  });
  inlines.add('component', (_name, _params, hash, context) => {
    let tag = _params && _params[0];

    if (typeof tag === 'string') {
      let returned = StaticComponentHelper(context, tag, hash, null);
      if (returned !== UNHANDLED) return returned;
    }

    let [definition, ...params] = _params;
    return InvokeDynamicComponent(context.meta, {
      definition,
      attrs: null,
      params,
      hash,
      atNames: false,
      blocks: EMPTY_BLOCKS
    });
  });
  return {
    blocks,
    inlines
  };
}

class MacrosImpl {
  constructor() {
    let {
      blocks,
      inlines
    } = populateBuiltins(new Blocks(), new Inlines());
    this.blocks = blocks;
    this.inlines = inlines;
  }

}
class Blocks {
  constructor() {
    this.names = dict();
    this.funcs = [];
  }

  add(name, func) {
    this.funcs.push(func);
    this.names[name] = this.funcs.length - 1;
  }

  addMissing(func) {
    this.missing = func;
  }

  compile(name, params, hash, blocks, context) {
    let index = this.names[name];
    let macroContext = {
      resolver: context.syntax.program.resolverDelegate,
      meta: context.meta
    };

    if (index === undefined) {
      let func = this.missing;
      let handled = func(name, params, hash, blocks, macroContext);
      return handled;
    } else {
      let func = this.funcs[index];
      return func(params, hash, blocks, macroContext);
    }
  }

}
class Inlines {
  constructor() {
    this.names = dict();
    this.funcs = [];
  }

  add(name, func) {
    this.funcs.push(func);
    this.names[name] = this.funcs.length - 1;
  }

  addMissing(func) {
    this.missing = func;
  }

  compile(sexp, context) {
    let [,,,, value] = sexp; // TODO: Fix this so that expression macros can return
    // things like components, so that {{component foo}}
    // is the same as {{(component foo)}}

    if (!Array.isArray(value)) return UNHANDLED;
    let name;
    let params;
    let hash;

    if (value[0] === 31
    /* Call */
    ) {
        let nameOrError = expectString(value[3], context.meta, 'Expected head of call to be a string');

        if (typeof nameOrError !== 'string') {
          return nameOrError;
        }

        name = nameOrError;
        params = value[4];
        hash = value[5];
      } else if (value[0] === 27
    /* GetPath */
    ) {
        let pathName = simplePathName(value, context.meta);

        if (pathName === null) {
          return UNHANDLED;
        }

        name = pathName;
        params = null;
        hash = null;
      } else {
      return UNHANDLED;
    }

    let index = this.names[name];
    let macroContext = {
      resolver: context.syntax.program.resolverDelegate,
      meta: context.meta
    };

    if (index === undefined && this.missing) {
      let func = this.missing;
      return func(name, params, hash, macroContext);
    } else if (index !== undefined) {
      let func = this.funcs[index];
      return func(name, params, hash, macroContext);
    } else {
      return UNHANDLED;
    }
  }

}

function simplePathName([, get, tail], meta) {
  if (tail.length > 0) {
    return null;
  }

  if (get[0] === 25
  /* GetFree */
  || get[0] === 26
  /* GetContextualFree */
  ) {
      return meta.upvars[get[1]];
    }

  return null;
}

function JitContext(resolver = {}, macros = new MacrosImpl()) {
  return {
    program: new JitProgramCompilationContext(new DefaultCompileTimeResolverDelegate(resolver)),
    macros
  };
}
function templateCompilationContext(syntax, meta) {
  let encoder = new EncoderImpl();
  return {
    syntax,
    encoder,
    meta
  };
}

const STATEMENTS = new Compilers();
STATEMENTS.add(2
/* Comment */
, sexp => op(42
/* Comment */
, sexp[1]));
STATEMENTS.add(11
/* CloseElement */
, () => op(55
/* CloseElement */
));
STATEMENTS.add(10
/* FlushElement */
, () => op(54
/* FlushElement */
));
STATEMENTS.add(3
/* Modifier */
, (sexp, meta) => {
  let [,,, name, params, hash] = sexp;
  let stringName = expectString(name, meta, 'Expected modifier head to be a string');

  if (typeof stringName !== 'string') {
    return stringName;
  }

  return op('IfResolved', {
    kind: "Modifier"
    /* Modifier */
    ,
    name: stringName,
    andThen: handle => [op(0
    /* PushFrame */
    ), op('SimpleArgs', {
      params,
      hash,
      atNames: false
    }), op(57
    /* Modifier */
    , handle), op(1
    /* PopFrame */
    )],
    span: {
      start: 0,
      end: 0
    }
  });
});
STATEMENTS.add(12
/* StaticAttr */
, ([, name, value, namespace]) => op(51
/* StaticAttr */
, name, value, namespace));
STATEMENTS.add(23
/* StaticComponentAttr */
, ([, name, value, namespace]) => op(108
/* StaticComponentAttr */
, name, value, namespace));
STATEMENTS.add(13
/* DynamicAttr */
, ([, name, value, namespace]) => [op('Expr', value), op(52
/* DynamicAttr */
, name, false, namespace)]);
STATEMENTS.add(20
/* TrustingDynamicAttr */
, ([, name, value, namespace]) => [op('Expr', value), op(52
/* DynamicAttr */
, name, true, namespace)]);
STATEMENTS.add(14
/* ComponentAttr */
, ([, name, value, namespace]) => [op('Expr', value), op(53
/* ComponentAttr */
, name, false, namespace)]);
STATEMENTS.add(21
/* TrustingComponentAttr */
, ([, name, value, namespace]) => [op('Expr', value), op(53
/* ComponentAttr */
, name, true, namespace)]);
STATEMENTS.add(9
/* OpenElement */
, ([, tag, simple]) => {
  if (simple) {
    return op(48
    /* OpenElement */
    , tag);
  } else {
    return [op(91
    /* PutComponentOperations */
    ), op(48
    /* OpenElement */
    , tag)];
  }
});
STATEMENTS.add(7
/* Component */
, ([, tag, attrs, args, blocks]) => {
  if (typeof tag === 'string') {
    return op('IfResolvedComponent', {
      name: tag,
      attrs,
      blocks,
      staticTemplate: (layoutHandle, capabilities, template, {
        blocks,
        attrs
      }) => {
        return [op(80
        /* PushComponentDefinition */
        , layoutHandle), InvokeStaticComponent({
          capabilities,
          layout: template,
          attrs,
          params: null,
          hash: args,
          blocks
        })];
      },
      dynamicTemplate: (layoutHandle, capabilities, {
        attrs,
        blocks
      }) => {
        return [op(80
        /* PushComponentDefinition */
        , layoutHandle), InvokeComponent({
          capabilities,
          attrs,
          params: null,
          hash: args,
          atNames: true,
          blocks
        })];
      }
    });
  } else {
    return op('DynamicComponent', {
      definition: tag,
      attrs,
      params: null,
      args,
      blocks,
      atNames: true
    });
  }
});
STATEMENTS.add(17
/* Partial */
, ([, name, evalInfo], meta) => ReplayableIf({
  args() {
    return {
      count: 2,
      actions: [op('Expr', name), op(33
      /* Dup */
      , $sp, 0)]
    };
  },

  ifTrue() {
    return [op(104
    /* InvokePartial */
    , templateMeta(meta.referrer), strArray(meta.evalSymbols), arr(evalInfo)), op(40
    /* PopScope */
    ), op(1
    /* PopFrame */
    )];
  }

}));
STATEMENTS.add(16
/* Yield */
, ([, to, params]) => YieldBlock(to, params));
STATEMENTS.add(15
/* AttrSplat */
, ([, to]) => YieldBlock(to, EMPTY_ARRAY));
STATEMENTS.add(22
/* Debugger */
, ([, evalInfo], meta) => op(106
/* Debugger */
, strArray(meta.evalSymbols), arr(evalInfo)));
STATEMENTS.add(1
/* Append */
, sexp => {
  let [, trusted,,, value] = sexp;

  if (typeof value === 'string' && trusted) {
    return op(41
    /* Text */
    , value);
  }

  return op('CompileInline', {
    inline: sexp,
    ifUnhandled: () => [op(0
    /* PushFrame */
    ), op("Expr"
    /* Expr */
    , value), op(3
    /* InvokeStatic */
    , {
      type: 'stdlib',
      value: trusted ? 'trusting-append' : 'cautious-append'
    }), op(1
    /* PopFrame */
    )]
  });
});
STATEMENTS.add(5
/* Block */
, sexp => {
  return op('CompileBlock', sexp);
});

const PLACEHOLDER_HANDLE = -1;

class CompilableTemplateImpl {
  constructor(statements, meta, // Part of CompilableTemplate
  symbolTable) {
    this.statements = statements;
    this.meta = meta;
    this.symbolTable = symbolTable;
    this.compiled = null;
  } // Part of CompilableTemplate


  compile(context) {
    return maybeCompile(this, context);
  }

}

function compilable(layout) {
  let block = layout.block;
  return new CompilableTemplateImpl(block.statements, meta(layout), {
    symbols: block.symbols,
    hasEval: block.hasEval
  });
}

function maybeCompile(compilable, context) {
  if (compilable.compiled !== null) return compilable.compiled;
  compilable.compiled = PLACEHOLDER_HANDLE;
  let {
    statements,
    meta
  } = compilable;
  let result = compileStatements(statements, meta, context);
  patchStdlibs(context.program);
  compilable.compiled = result;
  return result;
}

function compileStatements(statements, meta, syntaxContext) {
  let sCompiler = STATEMENTS;
  let context = templateCompilationContext(syntaxContext, meta);

  for (let i = 0; i < statements.length; i++) {
    concatStatements(context, sCompiler.compile(statements[i], context.meta));
  }

  let handle = context.encoder.commit(syntaxContext.program.heap, meta.size);

  return handle;
}
function compilableBlock(overloadBlock, containing) {
  let block = Array.isArray(overloadBlock) ? {
    statements: overloadBlock,
    parameters: EMPTY_ARRAY
  } : overloadBlock;
  return new CompilableTemplateImpl(block.statements, containing, {
    parameters: block.parameters
  });
}

class NamedBlocksImpl {
  constructor(blocks) {
    this.blocks = blocks;
    this.names = blocks ? Object.keys(blocks) : [];
  }

  get(name) {
    if (!this.blocks) return null;
    return this.blocks[name] || null;
  }

  has(name) {
    let {
      blocks
    } = this;
    return blocks !== null && name in blocks;
  }

  with(name, block) {
    let {
      blocks
    } = this;

    if (blocks) {
      return new NamedBlocksImpl(assign({}, blocks, {
        [name]: block
      }));
    } else {
      return new NamedBlocksImpl({
        [name]: block
      });
    }
  }

  get hasAny() {
    return this.blocks !== null;
  }

}
const EMPTY_BLOCKS = new NamedBlocksImpl(null);
function namedBlocks(blocks, meta) {
  if (blocks === null) {
    return EMPTY_BLOCKS;
  }

  let out = dict();
  let [keys, values] = blocks;

  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = compilableBlock(values[i], meta);
  }

  return new NamedBlocksImpl(out);
}
function expectString(expr, meta, desc) {
  if (!meta.upvars) {
    return error(`${desc}, but there were no free variables in the template`, 0, 0);
  }

  if (!Array.isArray(expr) || expr[0] !== 27
  /* GetPath */
  ) {
      throw new Error(`${desc}, got ${JSON.stringify(expr)}`);
    }

  if (expr[2].length !== 0) {
    throw new Error(`${desc}, got ${JSON.stringify(expr)}`);
  }

  if (expr[1][0] === 26
  /* GetContextualFree */
  || expr[1][0] === 25
  /* GetFree */
  ) {
      let head = expr[1][1];
      return meta.upvars[head];
    }

  throw new Error(`${desc}, got ${JSON.stringify(expr)}`);
}

function compileInline(sexp, context) {
  return context.syntax.macros.inlines.compile(sexp, context);
}
function compileBlock(block, context) {
  let [, name, params, hash, named] = block;
  let blocks = namedBlocks(named, context.meta);
  let nameOrError = expectString(name, context.meta, 'Expected block head to be a string');

  if (typeof nameOrError !== 'string') {
    return nameOrError;
  }

  return context.syntax.macros.blocks.compile(nameOrError, params || [], hash, blocks, context);
}
function commit(heap, scopeSize, buffer) {
  let handle = heap.malloc();

  for (let i = 0; i < buffer.length; i++) {
    let value = buffer[i];

    if (typeof value === 'function') {
      heap.pushPlaceholder(value);
    } else if (typeof value === 'object') {
      heap.pushStdlib(value);
    } else {
      heap.push(value);
    }
  }

  heap.finishMalloc(handle, scopeSize);
  return handle;
}

class LabelsImpl {
  constructor() {
    this.labels = dict();
    this.targets = [];
  }

  label(name, index) {
    this.labels[name] = index;
  }

  target(at, target) {
    this.targets.push({
      at,
      target
    });
  }

  patch(encoder) {
    let {
      targets,
      labels
    } = this;

    for (let i = 0; i < targets.length; i++) {
      let {
        at,
        target
      } = targets[i];
      let address = labels[target] - at;
      encoder.patch(at, address);
    }
  }

}
function error(problem, start, end) {
  return op('Error', {
    problem,
    start,
    end
  });
}
function op(name, op1, op2, op3) {
  if (typeof name === 'number') {
    if (op3 !== undefined) {
      return {
        type: 'Number',
        op: name,
        op1,
        op2,
        op3
      };
    } else if (op2 !== undefined) {
      return {
        type: 'Number',
        op: name,
        op1,
        op2
      };
    } else if (op1 !== undefined) {
      return {
        type: 'Number',
        op: name,
        op1: op1
      };
    } else {
      return {
        type: 'Number',
        op: name
      };
    }
  } else {
    let type;

    if (isCompileOpcode(name)) {
      type = 'Compile';
    } else if (isResolutionOpcode(name)) {
      type = 'Resolution';
    } else if (isSimpleOpcode(name)) {
      type = 'Simple';
    } else if (isErrorOpcode(name)) {
      type = 'Error';
    } else {
      throw new Error(`Exhausted ${name}`);
    }

    if (op1 === undefined) {
      return {
        type,
        op: name,
        op1: undefined
      };
    } else {
      return {
        type,
        op: name,
        op1
      };
    }
  }
}
class EncoderImpl {
  constructor() {
    this.labelsStack = new StackImpl();
    this.encoder = new InstructionEncoderImpl([]);
    this.errors = [];
  }

  error(error) {
    this.encoder.encode(30
    /* Primitive */
    , 0);
    this.errors.push(error);
  }

  commit(heap, size) {
    this.encoder.encode(5
    /* Return */
    , 1024
    /* MACHINE_MASK */
    );
    let handle = commit(heap, size, this.encoder.buffer);

    if (this.errors.length) {
      return {
        errors: this.errors,
        handle
      };
    } else {
      return handle;
    }
  }

  push(constants, name, ...args) {
    if (isMachineOp(name)) {
      let operands = args.map((operand, i) => this.operand(constants, operand, i));
      return this.encoder.encode(name, 1024
      /* MACHINE_MASK */
      , ...operands);
    } else {
      let operands = args.map((operand, i) => this.operand(constants, operand, i));
      return this.encoder.encode(name, 0, ...operands);
    }
  }

  operand(constants, operand, index) {
    if (operand && typeof operand === 'object' && operand.type === 'label') {
      this.currentLabels.target(this.encoder.size + index, operand.value);
      return -1;
    }

    return constant(constants, operand);
  }

  get currentLabels() {
    return this.labelsStack.current;
  }

  label(name) {
    this.currentLabels.label(name, this.encoder.size);
  }

  startLabels() {
    this.labelsStack.push(new LabelsImpl());
  }

  stopLabels() {
    let label = this.labelsStack.pop();
    label.patch(this.encoder);
  }

}

function constant(constants, operand) {
  if (typeof operand === 'number' || typeof operand === 'function') {
    return operand;
  }

  if (typeof operand === 'boolean') {
    return operand === true ? 1 : 0;
  }

  if (typeof operand === 'string') {
    return constants.string(operand);
  }

  if (operand === null) {
    return 0;
  }

  switch (operand.type) {
    case 'array':
      return constants.array(operand.value);

    case 'string-array':
      return constants.stringArray(operand.value);

    case 'serializable':
      return constants.serializable(operand.value);

    case 'template-meta':
      return constants.templateMeta(operand.value);

    case 'other':
      // TODO: Bad cast
      return constants.other(operand.value);

    case 'stdlib':
      return operand;

    case 'primitive':
      {
        switch (operand.value.type) {
          case 1
          /* STRING */
          :
            return encodeHandle(constants.string(operand.value.primitive), 1073741823
            /* STRING_MAX_INDEX */
            , -1
            /* STRING_MAX_HANDLE */
            );

          case 2
          /* NUMBER */
          :
            return encodeHandle(constants.number(operand.value.primitive), 1073741823
            /* NUMBER_MAX_INDEX */
            , -1073741825
            /* NUMBER_MAX_HANDLE */
            );

          case 0
          /* IMMEDIATE */
          :
            return encodeImmediate(operand.value.primitive);

          default:
            return exhausted(operand.value);
        }
      }

    case 'lookup':
      throw unreachable('lookup not reachable');

    default:
      return exhausted(operand);
  }
}

function isSimpleOpcode(op) {
  return op === 'Label' || op === 'Option' || op === 'GetComponentLayout' || op === 'StartLabels' || op === 'StopLabels' || op === 'SimpleArgs' || op === 'JitCompileBlock' || op === 'SetBlock';
}

function isCompileOpcode(op) {
  return op === 'CompileInline' || op === 'CompileBlock' || op === 'InvokeStatic' || op === 'PushCompilable' || op === 'Args' || op === 'IfResolvedComponent' || op === 'DynamicComponent';
}

function isResolutionOpcode(op) {
  return op === 'IfResolved' || op === 'Expr' || op === 'SimpleArgs' || op === 'ResolveFree' || op === 'ResolveContextualFree';
}

function isErrorOpcode(op) {
  return op === 'Error';
}

/**
 * Compile arguments, pushing an Arguments object onto the stack.
 *
 * @param args.params
 * @param args.hash
 * @param args.blocks
 * @param args.atNames
 */

function CompileArgs({
  params,
  hash,
  blocks,
  atNames
}) {
  let out = [];
  let blockNames = blocks.names;

  for (let i = 0; i < blockNames.length; i++) {
    out.push(PushYieldableBlock(blocks.get(blockNames[i])));
  }

  let {
    count,
    actions
  } = CompilePositional(params);
  out.push(actions);
  let flags = count << 4;
  if (atNames) flags |= 0b1000;

  if (blocks) {
    flags |= 0b111;
  }

  let names = EMPTY_ARRAY;

  if (hash) {
    names = hash[0];
    let val = hash[1];

    for (let i = 0; i < val.length; i++) {
      out.push(op('Expr', val[i]));
    }
  }

  out.push(op(84
  /* PushArgs */
  , strArray(names), strArray(blockNames), flags));
  return out;
}
/**
 * Compile an optional list of positional arguments, which pushes each argument
 * onto the stack and returns the number of parameters compiled
 *
 * @param params an optional list of positional arguments
 */

function CompilePositional(params) {
  if (!params) return {
    count: 0,
    actions: NONE
  };
  let actions = [];

  for (let i = 0; i < params.length; i++) {
    actions.push(op('Expr', params[i]));
  }

  return {
    count: params.length,
    actions
  };
}
function meta(layout) {
  return {
    asPartial: layout.asPartial || false,
    evalSymbols: evalSymbols(layout),
    upvars: layout.block.upvars,
    referrer: layout.referrer,
    size: layout.block.symbols.length
  };
}
function evalSymbols(layout) {
  let {
    block
  } = layout;
  return block.hasEval ? block.symbols : null;
}

const ATTRS_BLOCK = '&attrs';
function StaticComponentHelper(context, tag, hash, template) {
  let component = resolveLayoutForTag(tag, context);

  if (component !== null) {
    let {
      compilable,
      handle,
      capabilities
    } = component;

    if (compilable) {
      if (hash) {
        for (let i = 0; i < hash.length; i = i + 2) {
          hash[i][0] = `@${hash[i][0]}`;
        }
      }

      let out = [op(80
      /* PushComponentDefinition */
      , handle)];
      out.push(InvokeStaticComponent({
        capabilities,
        layout: compilable,
        attrs: null,
        params: null,
        hash,
        blocks: new NamedBlocksImpl({
          default: template
        })
      }));
      return out;
    }
  }

  return UNHANDLED;
}
function InvokeStaticComponent({
  capabilities,
  layout,
  attrs,
  params,
  hash,
  blocks
}) {
  let {
    symbolTable
  } = layout;
  let bailOut = symbolTable.hasEval || capabilities.prepareArgs;

  if (bailOut) {
    return InvokeComponent({
      capabilities,
      attrs,
      params,
      hash,
      atNames: true,
      blocks,
      layout
    });
  }

  let out = [op(36
  /* Fetch */
  , $s0), op(33
  /* Dup */
  , $sp, 1), op(35
  /* Load */
  , $s0)];
  let {
    symbols
  } = symbolTable;

  if (capabilities.createArgs) {
    out.push(op(0
    /* PushFrame */
    ), op('SimpleArgs', {
      params,
      hash,
      atNames: true
    }));
  }

  out.push(op(100
  /* BeginComponentTransaction */
  ));

  if (capabilities.dynamicScope) {
    out.push(op(59
    /* PushDynamicScope */
    ));
  }

  if (capabilities.createInstance) {
    out.push(op(89
    /* CreateComponent */
    , blocks.has('default') | 0, $s0));
  }

  if (capabilities.createArgs) {
    out.push(op(1
    /* PopFrame */
    ));
  }

  out.push(op(0
  /* PushFrame */
  ), op(90
  /* RegisterComponentDestructor */
  , $s0));
  let bindings = [];
  out.push(op(92
  /* GetComponentSelf */
  , $s0));
  bindings.push({
    symbol: 0,
    isBlock: false
  });

  for (let i = 0; i < symbols.length; i++) {
    let symbol = symbols[i];

    switch (symbol.charAt(0)) {
      case '&':
        let callerBlock;

        if (symbol === ATTRS_BLOCK) {
          callerBlock = attrs;
        } else {
          callerBlock = blocks.get(symbol.slice(1));
        }

        if (callerBlock) {
          out.push(PushYieldableBlock(callerBlock));
          bindings.push({
            symbol: i + 1,
            isBlock: true
          });
        } else {
          out.push(PushYieldableBlock(null));
          bindings.push({
            symbol: i + 1,
            isBlock: true
          });
        }

        break;

      case '@':
        if (!hash) {
          break;
        }

        let [keys, values] = hash;
        let lookupName = symbol;
        let index = keys.indexOf(lookupName);

        if (index !== -1) {
          out.push(op('Expr', values[index]));
          bindings.push({
            symbol: i + 1,
            isBlock: false
          });
        }

        break;
    }
  }

  out.push(op(37
  /* RootScope */
  , symbols.length + 1, Object.keys(blocks).length > 0 ? 1 : 0));

  for (let i = bindings.length - 1; i >= 0; i--) {
    let {
      symbol,
      isBlock
    } = bindings[i];

    if (isBlock) {
      out.push(op('SetBlock', symbol));
    } else {
      out.push(op(19
      /* SetVariable */
      , symbol));
    }
  }

  out.push(op('InvokeStatic', layout));

  if (capabilities.createInstance) {
    out.push(op(103
    /* DidRenderLayout */
    , $s0));
  }

  out.push(op(1
  /* PopFrame */
  ), op(40
  /* PopScope */
  ));

  if (capabilities.dynamicScope) {
    out.push(op(60
    /* PopDynamicScope */
    ));
  }

  out.push(op(101
  /* CommitComponentTransaction */
  ), op(35
  /* Load */
  , $s0));
  return out;
}
function InvokeDynamicComponent(meta, {
  definition,
  attrs,
  params,
  hash,
  atNames,
  blocks
}) {
  return Replayable({
    args: () => {
      return {
        count: 2,
        actions: [op('Expr', definition), op(33
        /* Dup */
        , $sp, 0)]
      };
    },
    body: () => {
      return [op(66
      /* JumpUnless */
      , label('ELSE')), op(83
      /* ResolveDynamicComponent */
      , templateMeta(meta.referrer)), op(81
      /* PushDynamicComponentInstance */
      ), InvokeComponent({
        capabilities: true,
        attrs,
        params,
        hash,
        atNames,
        blocks
      }), op('Label', 'ELSE')];
    }
  });
}
function WrappedComponent(layout, attrsBlockNumber) {
  return [op('StartLabels'), WithSavedRegister($s1, () => [op(93
  /* GetComponentTagName */
  , $s0), op(31
  /* PrimitiveReference */
  ), op(33
  /* Dup */
  , $sp, 0)]), op(66
  /* JumpUnless */
  , label('BODY')), op(36
  /* Fetch */
  , $s1), op(91
  /* PutComponentOperations */
  ), op(49
  /* OpenDynamicElement */
  ), op(102
  /* DidCreateElement */
  , $s0), YieldBlock(attrsBlockNumber, EMPTY_ARRAY), op(54
  /* FlushElement */
  ), op('Label', 'BODY'), InvokeStaticBlock(blockForLayout(layout)), op(36
  /* Fetch */
  , $s1), op(66
  /* JumpUnless */
  , label('END')), op(55
  /* CloseElement */
  ), op('Label', 'END'), op(35
  /* Load */
  , $s1), op('StopLabels')];
}
function InvokeComponent({
  capabilities,
  attrs,
  params,
  hash,
  atNames,
  blocks: namedBlocks,
  layout
}) {
  let bindableBlocks = !!namedBlocks;
  let bindableAtNames = capabilities === true || capabilities.prepareArgs || !!(hash && hash[0].length !== 0);
  let blocks = namedBlocks.with('attrs', attrs);
  return [op(36
  /* Fetch */
  , $s0), op(33
  /* Dup */
  , $sp, 1), op(35
  /* Load */
  , $s0), op(0
  /* PushFrame */
  ), op('Args', {
    params,
    hash,
    blocks,
    atNames
  }), op(87
  /* PrepareArgs */
  , $s0), invokePreparedComponent(blocks.has('default'), bindableBlocks, bindableAtNames, () => {
    let out;

    if (layout) {
      out = [PushSymbolTable(layout.symbolTable), op('PushCompilable', layout), op('JitCompileBlock')];
    } else {
      out = [op('GetComponentLayout', $s0)];
    }

    out.push(op(98
    /* PopulateLayout */
    , $s0));
    return out;
  }), op(35
  /* Load */
  , $s0)];
}
function invokePreparedComponent(hasBlock, bindableBlocks, bindableAtNames, populateLayout = null) {
  let out = [op(100
  /* BeginComponentTransaction */
  ), op(59
  /* PushDynamicScope */
  ), op(89
  /* CreateComponent */
  , hasBlock | 0, $s0)]; // this has to run after createComponent to allow
  // for late-bound layouts, but a caller is free
  // to populate the layout earlier if it wants to
  // and do nothing here.

  if (populateLayout) {
    out.push(populateLayout());
  }

  out.push(op(90
  /* RegisterComponentDestructor */
  , $s0), op(92
  /* GetComponentSelf */
  , $s0), op(38
  /* VirtualRootScope */
  , $s0), op(19
  /* SetVariable */
  , 0), op(97
  /* SetupForEval */
  , $s0), bindableAtNames ? op(17
  /* SetNamedVariables */
  , $s0) : NONE, bindableBlocks ? op(18
  /* SetBlocks */
  , $s0) : NONE, op(34
  /* Pop */
  , 1), op(99
  /* InvokeComponentLayout */
  , $s0), op(103
  /* DidRenderLayout */
  , $s0), op(1
  /* PopFrame */
  ), op(40
  /* PopScope */
  ), op(60
  /* PopDynamicScope */
  ), op(101
  /* CommitComponentTransaction */
  ));
  return out;
}
function InvokeBareComponent() {
  return [op(36
  /* Fetch */
  , $s0), op(33
  /* Dup */
  , $sp, 1), op(35
  /* Load */
  , $s0), op(0
  /* PushFrame */
  ), op(85
  /* PushEmptyArgs */
  ), op(87
  /* PrepareArgs */
  , $s0), invokePreparedComponent(false, false, true, () => [op('GetComponentLayout', $s0), op(98
  /* PopulateLayout */
  , $s0)]), op(35
  /* Load */
  , $s0)];
}
function curryComponent({
  definition,
  params,
  hash,
  atNames
}, referrer) {
  return [op(0
  /* PushFrame */
  ), op('SimpleArgs', {
    params,
    hash,
    atNames
  }), op(88
  /* CaptureArgs */
  ), op('Expr', definition), op(79
  /* CurryComponent */
  , templateMeta(referrer)), op(1
  /* PopFrame */
  ), op(36
  /* Fetch */
  , $v0)];
}

function blockForLayout(layout) {
  return compilableBlock(layout.block.statements, meta(layout));
}

function WithSavedRegister(register, block) {
  return [op(36
  /* Fetch */
  , register), block(), op(35
  /* Load */
  , register)];
}

class StdLib {
  constructor(main, trustingGuardedAppend, cautiousGuardedAppend) {
    this.main = main;
    this.trustingGuardedAppend = trustingGuardedAppend;
    this.cautiousGuardedAppend = cautiousGuardedAppend;
  }

  get 'trusting-append'() {
    return this.trustingGuardedAppend;
  }

  get 'cautious-append'() {
    return this.cautiousGuardedAppend;
  }

  getAppend(trusting) {
    return trusting ? this.trustingGuardedAppend : this.cautiousGuardedAppend;
  }

}

function main() {
  return [op(76
  /* Main */
  , $s0), invokePreparedComponent(false, false, true)];
}
/**
 * Append content to the DOM. This standard function triages content and does the
 * right thing based upon whether it's a string, safe string, component, fragment
 * or node.
 *
 * @param trusting whether to interpolate a string as raw HTML (corresponds to
 * triple curlies)
 */

function StdAppend(trusting) {
  return [op(78
  /* ContentType */
  ), SwitchCases(when => {
    when(1
    /* String */
    , () => {
      if (trusting) {
        return [op(68
        /* AssertSame */
        ), op(43
        /* AppendHTML */
        )];
      } else {
        return op(47
        /* AppendText */
        );
      }
    });
    when(0
    /* Component */
    , () => [op(82
    /* PushCurriedComponent */
    ), op(81
    /* PushDynamicComponentInstance */
    ), InvokeBareComponent()]);
    when(3
    /* SafeString */
    , () => [op(68
    /* AssertSame */
    ), op(44
    /* AppendSafeHTML */
    )]);
    when(4
    /* Fragment */
    , () => [op(68
    /* AssertSame */
    ), op(45
    /* AppendDocumentFragment */
    )]);
    when(5
    /* Node */
    , () => [op(68
    /* AssertSame */
    ), op(46
    /* AppendNode */
    )]);
  })];
}
function compileStd(context) {
  let mainHandle = build(context, main);
  let trustingGuardedAppend = build(context, () => StdAppend(true));
  let cautiousGuardedAppend = build(context, () => StdAppend(false));
  return new StdLib(mainHandle, trustingGuardedAppend, cautiousGuardedAppend);
}
const STDLIB_META = {
  asPartial: false,
  evalSymbols: null,
  upvars: null,
  // TODO: ??
  referrer: {},
  size: 0
};

function build(program, callback) {
  let encoder = new EncoderImpl();
  let macros = new MacrosImpl();
  let stdContext = {
    encoder,
    meta: STDLIB_META,
    syntax: {
      macros,
      program
    }
  };
  concat(stdContext, callback());
  let result = encoder.commit(program.heap, 0);

  if (typeof result !== 'number') {
    // This shouldn't be possible
    throw new Error(`Unexpected errors compiling std`);
  } else {
    return result;
  }
}

class JitProgramCompilationContext {
  constructor(delegate) {
    this.constants = new JitConstants();
    this.heap = new HeapImpl();
    this.mode = "jit"
    /* jit */
    ;
    this.resolverDelegate = delegate;
    this.stdlib = compileStd(this);
  }

}

class WrappedBuilder {
  constructor(layout) {
    this.layout = layout;
    this.compiled = null;
    let {
      block
    } = layout;
    let symbols = block.symbols.slice(); // ensure ATTRS_BLOCK is always included (only once) in the list of symbols

    let attrsBlockIndex = symbols.indexOf(ATTRS_BLOCK);

    if (attrsBlockIndex === -1) {
      this.attrsBlockNumber = symbols.push(ATTRS_BLOCK);
    } else {
      this.attrsBlockNumber = attrsBlockIndex + 1;
    }

    this.symbolTable = {
      hasEval: block.hasEval,
      symbols
    };
  }

  compile(syntax) {
    if (this.compiled !== null) return this.compiled;
    let m = meta(this.layout);
    let context = templateCompilationContext(syntax, m);
    let actions = WrappedComponent(this.layout, this.attrsBlockNumber);
    concatStatements(context, actions);
    let handle = context.encoder.commit(context.syntax.program.heap, m.size);

    if (typeof handle !== 'number') {
      return handle;
    }

    this.compiled = handle;

    patchStdlibs(context.syntax.program);
    return handle;
  }

}

let clientId = 0;
function templateFactory({
  id: templateId,
  meta,
  block
}) {
  let parsedBlock;
  let id = templateId || `client-${clientId++}`;

  let create = envMeta => {
    let newMeta = envMeta ? assign({}, envMeta, meta) : meta;

    if (!parsedBlock) {
      parsedBlock = JSON.parse(block);
    }

    return new TemplateImpl({
      id,
      block: parsedBlock,
      referrer: newMeta
    });
  };

  return {
    id,
    meta,
    create
  };
}

class TemplateImpl {
  constructor(parsedLayout) {
    this.parsedLayout = parsedLayout;
    this.result = 'ok';
    this.layout = null;
    this.partial = null;
    this.wrappedLayout = null;
    let {
      block
    } = parsedLayout;
    this.symbols = block.symbols;
    this.hasEval = block.hasEval;
    this.referrer = parsedLayout.referrer;
    this.id = parsedLayout.id || `client-${clientId++}`;
  }

  asLayout() {
    if (this.layout) return this.layout;
    return this.layout = compilable(assign({}, this.parsedLayout, {
      asPartial: false
    }));
  }

  asPartial() {
    if (this.partial) return this.partial;
    return this.layout = compilable(assign({}, this.parsedLayout, {
      asPartial: true
    }));
  }

  asWrappedLayout() {
    if (this.wrappedLayout) return this.wrappedLayout;
    return this.wrappedLayout = new WrappedBuilder(assign({}, this.parsedLayout, {
      asPartial: false
    }));
  }

}

function isNativeIterable(value) {
    return typeof value === 'object' && value !== null && Symbol.iterator in value;
}
class NativeIterator {
    constructor(iterable, result) {
        this.iterable = iterable;
        this.result = result;
        this.position = 0;
    }
    static from(iterable) {
        const iterator = iterable[Symbol.iterator]();
        const result = iterator.next();
        const { done } = result;
        if (done === true) {
            return null;
        }
        else {
            return new this(iterator, result);
        }
    }
    isEmpty() {
        return false;
    }
    next() {
        const { iterable, result, position } = this;
        if (result.done) {
            return null;
        }
        const value = result.value;
        const memo = position;
        this.position++;
        this.result = iterable.next();
        return { value, memo };
    }
}

function toBool(predicate) {
    if (Array.isArray(predicate)) {
        return predicate.length !== 0;
    }
    else {
        return Boolean(predicate);
    }
}

/**
 * The environment delegate base class shared by both the client and SSR
 * environments. Contains shared definitions, but requires user to specify
 * `isInteractive` and a method for getting the protocols of URLs.
 *
 * @internal
 */
class BaseEnvDelegate {
    constructor() {
        // Match Ember's toBool semantics for cross-compatibility
        this.toBool = toBool;
    }
    toIterator(value) {
        if (isNativeIterable(value)) {
            return NativeIterator.from(value);
        }
        return null;
    }
}
/**
 * The client specific environment delegate.
 *
 * @internal
 */
class ClientEnvDelegate extends BaseEnvDelegate {
    constructor() {
        super(...arguments);
        this.isInteractive = true;
        this.uselessAnchor = self.document.createElement('a');
        this.protocolForURL = (url) => {
            // TODO - investigate alternative approaches
            // e.g. see `installPlatformSpecificProtocolForURL` in Ember
            this.uselessAnchor.href = url;
            return this.uselessAnchor.protocol;
        };
    }
}

const TEMPLATE_MAP = new WeakMap();
const getPrototypeOf = Object.getPrototypeOf;
function setComponentTemplate(template, ComponentClass) {
    TEMPLATE_MAP.set(ComponentClass, template);
    return ComponentClass;
}
function getComponentTemplate(ComponentClass) {
    let pointer = ComponentClass;
    while (pointer !== undefined && pointer !== null) {
        const manager = TEMPLATE_MAP.get(pointer);
        if (manager !== undefined) {
            return manager;
        }
        pointer = getPrototypeOf(pointer);
    }
    return undefined;
}

const OWNER_MAP = new WeakMap();
const OWNER_KEY = `__OWNER_${Math.floor(Math.random() * Date.now())}__`;
let DEFAULT_OWNER = {};
function setOwner(obj, owner) {
    OWNER_MAP.set(obj, owner);
}

///////////
const MANAGERS = new WeakMap();
const MANAGER_INSTANCES = new WeakMap();
const getPrototypeOf$1 = Object.getPrototypeOf;
function setManager(wrapper, obj) {
    MANAGERS.set(obj, wrapper);
    return obj;
}
function getManager(obj) {
    let pointer = obj;
    while (pointer !== undefined && pointer !== null) {
        const manager = MANAGERS.get(pointer);
        if (manager !== undefined) {
            return manager;
        }
        pointer = getPrototypeOf$1(pointer);
    }
    return undefined;
}
function getManagerInstanceForOwner(owner, factory) {
    let managers = MANAGER_INSTANCES.get(owner);
    if (managers === undefined) {
        managers = new WeakMap();
        MANAGER_INSTANCES.set(owner, managers);
    }
    let instance = managers.get(factory);
    if (instance === undefined) {
        instance = factory(owner);
        managers.set(factory, instance);
    }
    // We know for sure that it's the correct type at this point, but TS can't know
    return instance;
}
///////////
function setModifierManager(factory, definition) {
    return setManager({ factory, type: 'modifier' }, definition);
}
function getModifierManager(owner, definition) {
    const wrapper = getManager(definition);
    if (wrapper !== undefined && wrapper.type === 'modifier') {
        return getManagerInstanceForOwner(owner, wrapper.factory);
    }
}
function getHelperManager(owner, definition) {
    const wrapper = getManager(definition);
    if (wrapper !== undefined && wrapper.type === 'helper') {
        return getManagerInstanceForOwner(owner, wrapper.factory);
    }
}
function setComponentManager(factory, definition) {
    return setManager({ factory, type: 'component' }, definition);
}
function getComponentManager(owner, definition) {
    const wrapper = getManager(definition);
    if (wrapper !== undefined && wrapper.type === 'component') {
        return getManagerInstanceForOwner(owner, wrapper.factory);
    }
}

function convertToInt(prop) {
    if (typeof prop === 'symbol')
        return null;
    const num = Number(prop);
    if (isNaN(num))
        return null;
    return num % 1 === 0 ? num : null;
}
function argsProxyFor(capturedArgs, type) {
    const { named, positional } = capturedArgs;
    const namedHandler = {
        get(_target, prop) {
            if (named.has(prop)) {
                const ref = named.get(prop);
                consumeTag(ref.tag);
                return ref.value();
            }
        },
        has(_target, prop) {
            return named.has(prop);
        },
        ownKeys(_target) {
            return named.names;
        },
        isExtensible() {
            return false;
        },
        getOwnPropertyDescriptor(_target, prop) {
            return {
                enumerable: true,
                configurable: true,
            };
        },
    };
    const positionalHandler = {
        get(target, prop) {
            if (prop === 'length') {
                consumeTag(positional.tag);
                return positional.length;
            }
            const parsed = convertToInt(prop);
            if (parsed !== null && parsed < positional.length) {
                const ref = positional.at(parsed);
                consumeTag(ref.tag);
                return ref.value();
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return target[prop];
        },
        isExtensible() {
            return false;
        },
        has(_target, prop) {
            const parsed = convertToInt(prop);
            return parsed !== null && parsed < positional.length;
        },
    };
    const namedTarget = Object.create(null);
    const positionalTarget = [];
    return {
        named: new Proxy(namedTarget, namedHandler),
        positional: new Proxy(positionalTarget, positionalHandler),
    };
}

const VM_CAPABILITIES = {
    createInstance: true,
    dynamicLayout: false,
    dynamicTag: false,
    wrapped: false,
    prepareArgs: false,
    createArgs: true,
    attributeHook: false,
    elementHook: false,
    updateHook: false,
    createCaller: false,
    dynamicScope: true,
    willDestroy: false,
};
function capabilities(managerAPI, options = {}) {
    debugAssert(managerAPI === '3.4' || managerAPI === '3.13', 'Invalid component manager compatibility specified');
    const updateHook = managerAPI !== '3.4' ? Boolean(options.updateHook) : true;
    return {
        asyncLifecycleCallbacks: Boolean(options.asyncLifecycleCallbacks),
        destructor: Boolean(options.destructor),
        updateHook,
    };
}
function hasAsyncLifecycleCallbacks(delegate) {
    return delegate.capabilities.asyncLifecycleCallbacks;
}
function hasUpdateHook(delegate) {
    return delegate.capabilities.updateHook;
}
function hasAsyncUpdateHook(delegate) {
    return hasAsyncLifecycleCallbacks(delegate) && hasUpdateHook(delegate);
}
function hasDestructors(delegate) {
    return delegate.capabilities.destructor;
}
///////////
/**
  The CustomComponentManager allows addons to provide custom component
  implementations that integrate seamlessly into Ember. This is accomplished
  through a delegate, registered with the custom component manager, which
  implements a set of hooks that determine component behavior.

  To create a custom component manager, instantiate a new CustomComponentManager
  class and pass the delegate as the first argument:

  ```js
  let manager = new CustomComponentManager({
    // ...delegate implementation...
  });
  ```

  ## Delegate Hooks

  Throughout the lifecycle of a component, the component manager will invoke
  delegate hooks that are responsible for surfacing those lifecycle changes to
  the end developer.

  * `create()` - invoked when a new instance of a component should be created
  * `update()` - invoked when the arguments passed to a component change
  * `getContext()` - returns the object that should be
*/
class CustomComponentManager {
    create(env, definition, args, dynamicScope) {
        const { ComponentDefinition } = definition;
        const capturedArgs = args.capture();
        const owner = dynamicScope.get(OWNER_KEY).value();
        const delegate = getComponentManager(owner, ComponentDefinition);
        const argsProxy = argsProxyFor(capturedArgs);
        const component = delegate.createComponent(ComponentDefinition, argsProxy);
        return new VMCustomComponentState(env, delegate, component, capturedArgs, argsProxy);
    }
    update({ delegate, component, argsProxy }) {
        if (hasUpdateHook(delegate)) {
            delegate.updateComponent(component, argsProxy);
        }
    }
    didCreate({ delegate, component }) {
        if (hasAsyncLifecycleCallbacks(delegate)) {
            delegate.didCreateComponent(component);
        }
    }
    didUpdate({ delegate, component }) {
        if (hasAsyncUpdateHook(delegate)) {
            delegate.didUpdateComponent(component);
        }
    }
    getContext({ delegate, component }) {
        delegate.getContext(component);
    }
    getSelf({ env, delegate, component, }) {
        return new ComponentRootReference(delegate.getContext(component), env);
    }
    getDestructor(state) {
        if (hasDestructors(state.delegate)) {
            return state;
        }
        return null;
    }
    getCapabilities({ capabilities, }) {
        return Object.assign({}, VM_CAPABILITIES, {
            updateHook: capabilities.updateHook,
        });
    }
    getTag({ args }) {
        if (isConst(args)) {
            // returning a const tag skips the update hook (VM BUG?)
            return createTag();
        }
        return args.tag;
    }
    didRenderLayout() { } // eslint-disable-line @typescript-eslint/no-empty-function
    didUpdateLayout() { } // eslint-disable-line @typescript-eslint/no-empty-function
    getJitStaticLayout({ definition, }) {
        return definition.template.asLayout();
    }
}
///////////
/**
 * Stores internal state about a component instance after it's been created.
 */
class VMCustomComponentState {
    constructor(env, delegate, component, args, argsProxy) {
        this.env = env;
        this.delegate = delegate;
        this.component = component;
        this.args = args;
        this.argsProxy = argsProxy;
    }
    destroy() {
        const { delegate, component } = this;
        if (hasDestructors(delegate)) {
            delegate.destroyComponent(component);
        }
    }
}
const CUSTOM_COMPONENT_MANAGER = new CustomComponentManager();
class VMCustomComponentDefinition {
    constructor(handle, ComponentDefinition, template) {
        this.manager = CUSTOM_COMPONENT_MANAGER;
        this.handle = handle;
        this.template = unwrapTemplate(template);
        const capabilities = getComponentManager(DEFAULT_OWNER, ComponentDefinition).capabilities;
        this.state = {
            ComponentDefinition,
            capabilities,
            definition: this,
        };
    }
}

function trackedMemoize(fn) {
    let lastValue;
    let tag;
    let snapshot;
    return () => {
        if (!tag || !validateTag(tag, snapshot)) {
            tag = track(() => (lastValue = fn()));
            snapshot = valueForTag();
        }
        consumeTag(tag);
        return lastValue;
    };
}

function hasUpdateHook$1(delegate) {
    return delegate.capabilities.updateHook;
}
function hasDestructor(delegate) {
    return delegate.capabilities.destructor;
}
///////////
function customHelperFn(manager, definition, capturedArgs, vm) {
    let bucket;
    const argsProxy = argsProxyFor(capturedArgs);
    const hasUpdate = hasUpdateHook$1(manager);
    if (hasDestructor(manager)) {
        vm.associateDestroyable({
            destroy() {
                if (bucket !== undefined) {
                    manager.destroyHelper(bucket);
                }
            },
        });
    }
    const getValue = trackedMemoize(() => manager.getValue(bucket));
    const createOrUpdate = trackedMemoize(() => {
        if (bucket === undefined) {
            bucket = manager.createHelper(definition, argsProxy);
        }
        else if (hasUpdate) {
            manager.updateHelper(bucket, argsProxy);
        }
    });
    return () => {
        createOrUpdate();
        return getValue();
    };
}
/**
 * Returns a factory that produces a HelperRootReference, which is how the VM
 * expects to receive helpers currently.
 *
 * @param definition the helper definition
 */
function vmHelperFactoryFor(definition) {
    return (args, vm) => {
        const owner = vm.dynamicScope().get(OWNER_KEY).value();
        const manager = getHelperManager(owner, definition);
        const capturedArgs = args.capture();
        let helperFn;
        if (manager !== undefined) {
            helperFn = customHelperFn(manager, definition, capturedArgs, vm);
        }
        else {
            const func =  definition;
            helperFn = (capturedArgs) => {
                return func(...capturedArgs.positional.value());
            };
        }
        return new HelperRootReference(helperFn, capturedArgs, vm.env);
    };
}

const CAPABILITIES = {
    attributeHook: false,
    createArgs: false,
    createCaller: false,
    createInstance: true,
    dynamicLayout: false,
    dynamicScope: false,
    dynamicTag: false,
    elementHook: false,
    prepareArgs: false,
    updateHook: false,
    wrapped: false,
    willDestroy: false,
};
const EMPTY_SELF = new ConstReference(null);
class TemplateOnlyComponentManager {
    static create() {
        return new TemplateOnlyComponentManager();
    }
    getCapabilities() {
        return CAPABILITIES;
    }
    getJitStaticLayout({ definition }) {
        return definition.template.asLayout();
    }
    create(_env, state) {
        // In development mode, save off state needed for error messages. This will
        // get stripped in production mode and no bucket will be instantiated.
        return  undefined;
    }
    getSelf(bucket) {
        return  EMPTY_SELF;
    }
    getTag() {
        return CONSTANT_TAG;
    }
    didRenderLayout() { } // eslint-disable-line @typescript-eslint/no-empty-function
    didCreate() { } // eslint-disable-line @typescript-eslint/no-empty-function
    didUpdateLayout() { } // eslint-disable-line @typescript-eslint/no-empty-function
    didUpdate() { } // eslint-disable-line @typescript-eslint/no-empty-function
    getDestructor() {
        return null;
    }
}
const TEMPLATE_ONLY_MANAGER = new TemplateOnlyComponentManager();
class TemplateOnlyComponentDefinition {
    constructor(handle, name, template) {
        this.manager = TEMPLATE_ONLY_MANAGER;
        this.handle = handle;
        this.template = unwrapTemplate(template);
        this.state = {
            name,
            definition: this,
        };
    }
}
class TemplateOnlyComponent {
}

function capabilities$1(managerAPI, options = {}) {
    debugAssert(managerAPI === '3.13', 'Invalid component manager compatibility specified');
    return {
        disableAutoTracking: Boolean(options.disableAutoTracking),
    };
}
class SimpleModifierManager {
    constructor() {
        this.capabilities = capabilities$1('3.13');
    }
    createModifier(definition, args) {
        return { definition };
    }
    installModifier(bucket, element, args) {
        bucket.destructor = bucket.definition(element, ...args.positional);
        bucket.element = element;
    }
    updateModifier(bucket, args) {
        this.destroyModifier(bucket);
        this.installModifier(bucket, bucket.element, args);
    }
    destroyModifier(bucket) {
        const { destructor } = bucket;
        if (destructor !== undefined) {
            destructor();
        }
    }
}
const SIMPLE_MODIFIER_MANAGER = new SimpleModifierManager();
///////////
class CustomModifierState {
    constructor(element, delegate, modifier, argsProxy, capturedArgs) {
        this.element = element;
        this.delegate = delegate;
        this.modifier = modifier;
        this.argsProxy = argsProxy;
        this.capturedArgs = capturedArgs;
        this.tag = createUpdatableTag();
    }
    destroy() {
        const { delegate, modifier, argsProxy } = this;
        delegate.destroyModifier(modifier, argsProxy);
    }
}
class CustomModifierManager {
    create(element, definition, args, dynamicScope) {
        const owner = dynamicScope.get(OWNER_KEY).value();
        let delegate = getModifierManager(owner, definition);
        if (delegate === undefined) {
            delegate = SIMPLE_MODIFIER_MANAGER;
        }
        const capturedArgs = args.capture();
        const argsProxy = argsProxyFor(capturedArgs);
        const instance = delegate.createModifier(definition, argsProxy);
        return new CustomModifierState(element, delegate, instance, argsProxy, capturedArgs);
    }
    getTag({ tag, capturedArgs }) {
        return combine([tag, capturedArgs.tag]);
    }
    install(state) {
        const { element, argsProxy, delegate, modifier, tag } = state;
        if (delegate.capabilities.disableAutoTracking === true) {
            untrack(() => delegate.installModifier(modifier, element, argsProxy));
        }
        else {
            const combinedTrackingTag = track(() => delegate.installModifier(modifier, element, argsProxy), DEBUG );
            updateTag(tag, combinedTrackingTag);
        }
    }
    update(state) {
        const { argsProxy, delegate, modifier, tag } = state;
        if (delegate.capabilities.disableAutoTracking === true) {
            untrack(() => delegate.updateModifier(modifier, argsProxy));
        }
        else {
            const combinedTrackingTag = track(() => delegate.updateModifier(modifier, argsProxy), DEBUG );
            updateTag(tag, combinedTrackingTag);
        }
    }
    getDestructor(state) {
        return state;
    }
}
const CUSTOM_MODIFIER_MANAGER = new CustomModifierManager();
class VMCustomModifierDefinition {
    constructor(handle, state) {
        this.handle = handle;
        this.state = state;
        this.manager = CUSTOM_MODIFIER_MANAGER;
    }
}

///////////
let HANDLE = 0;
const VM_COMPONENT_DEFINITIONS = new WeakMap();
const VM_HELPER_DEFINITIONS = new WeakMap();
const VM_MODIFIER_DEFINITIONS = new WeakMap();
function vmDefinitionForComponent(ComponentDefinition) {
    return (VM_COMPONENT_DEFINITIONS.get(ComponentDefinition) ||
        createVMComponentDefinition(ComponentDefinition));
}
function vmDefinitionForHelper(Helper) {
    return VM_HELPER_DEFINITIONS.get(Helper) || createVMHelperDefinition(Helper);
}
function vmDefinitionForModifier(Modifier) {
    return VM_MODIFIER_DEFINITIONS.get(Modifier) || createVMModifierDefinition(Modifier);
}
function handleForBuiltIn(builtIn) {
    return HANDLE++;
}
function vmDefinitionForBuiltInHelper(helper) {
    return {
        helper,
        handle: handleForBuiltIn(),
    };
}
///////////
function createVMComponentDefinition(ComponentDefinition) {
    const serializedTemplate = getComponentTemplate(ComponentDefinition);
    const template = templateFactory(serializedTemplate).create();
    let definition;
    if (ComponentDefinition instanceof TemplateOnlyComponent) {
        // TODO: We probably need a better way to get a name for the template,
        // currently it'll just be `template-only-component` which is not great
        // for debugging
        definition = new TemplateOnlyComponentDefinition(HANDLE++, 'template-only-component', template);
    }
    else {
        definition = new VMCustomComponentDefinition(HANDLE++, ComponentDefinition, template);
    }
    VM_COMPONENT_DEFINITIONS.set(ComponentDefinition, definition);
    return definition;
}
function createVMHelperDefinition(userDefinition) {
    const definition = {
        helper: vmHelperFactoryFor(userDefinition),
        handle: HANDLE++,
    };
    VM_HELPER_DEFINITIONS.set(userDefinition, definition);
    return definition;
}
function createVMModifierDefinition(Modifier) {
    const definition = new VMCustomModifierDefinition(HANDLE++, Modifier);
    VM_MODIFIER_DEFINITIONS.set(Modifier, definition);
    return definition;
}

function ifHelper(args, vm) {
    return new HelperRootReference(({ positional }) => {
        if ( positional.length > 3) {
            throw new Error('The inline form of the `if` helper expects two or three arguments, e.g. `{{if trialExpired "Expired" expiryDate}}`.');
        }
        const condition = positional.at(0);
        const truthyValue = positional.at(1);
        const falsyValue = positional.at(2);
        if (toBool(condition.value()) === true) {
            return truthyValue.value();
        }
        else {
            return falsyValue !== undefined ? falsyValue.value() : undefined;
        }
    }, args.capture(), vm.env, 'if');
}

const builtInHelpers = {
    if: vmDefinitionForBuiltInHelper(ifHelper),
};
///////////
/**
 * The RuntimeResolver is what is used to resolve everything. It is responsible
 * for registering root components (passed to `renderComponent`), and resolving
 * all other types of resolvables.
 *
 * The CompileTimeResolver is responsible for registering everything but root
 * components, which is why `registry` is public, for ease of access.
 */
class RuntimeResolver {
    constructor() {
        this.registry = [];
    }
    // TODO: This is only necessary because `renderJitComponent` only receives a
    // string, can't receive a handle. We should make that optional somehow.
    registerRoot(definition) {
        const vmDefinition = vmDefinitionForComponent(definition);
        const { handle } = vmDefinition;
        this.registry[handle] = vmDefinition;
        // We're lying to the type system here so we can pass handle around as a
        // string. Should definitely fix this in the future.
        return handle;
    }
    lookupComponent(handle, _referrer) {
        return this.registry[handle];
    }
    resolve(handle) {
        return this.registry[handle];
    }
    // TODO: Make these optional
    compilable(_locator) {
        throw new Error('Method not implemented.');
    }
    lookupPartial(_name, _referrer) {
        throw new Error('Method not implemented.');
    }
}
///////////
/**
 * The CompileTimeResolver is what is used to lookup most things, with the
 * exception of root components rendered with `renderComponent`. It registers
 * the values on the RuntimeResolver, which Glimmer then uses to actually
 * resolve later on via the handle that is returned.
 */
class CompileTimeResolver {
    constructor(inner) {
        this.inner = inner;
    }
    lookupHelper(name, referrer) {
        const scope = referrer.scope();
        const { helper, handle } = builtInHelpers[name] || vmDefinitionForHelper(scope[name]);
        this.inner.registry[handle] = helper;
        return handle;
    }
    lookupModifier(name, referrer) {
        const scope = referrer.scope();
        const modifier = scope[name];
        const definition = vmDefinitionForModifier(modifier);
        const { handle } = definition;
        this.inner.registry[handle] = definition;
        return handle;
    }
    lookupComponent(name, referrer) {
        const scope = referrer.scope();
        const ComponentDefinition = scope[name];
        const definition = vmDefinitionForComponent(ComponentDefinition);
        const { state, manager, template, handle } = definition;
        this.inner.registry[handle] = definition;
        return {
            handle,
            capabilities: manager.getCapabilities(state),
            compilable: unwrapTemplate(template).asLayout(),
        };
    }
    resolve(handle) {
        return this.inner.resolve(handle);
    }
    // TODO: Make this optional
    lookupPartial(_name, _referrer) {
        throw new Error('Method not implemented.');
    }
}

let renderNotifiers = [];
async function renderComponent(ComponentClass, optionsOrElement) {
    const options = optionsOrElement instanceof HTMLElement ? { element: optionsOrElement } : optionsOrElement;
    const { element, args, owner } = options;
    const document = self.document;
    const iterator = getTemplateIterator(ComponentClass, element, { document }, new ClientEnvDelegate(), args, owner);
    const result = iterator.sync();
    results.push(result);
}
const results = [];
setPropertyDidChange(scheduleRevalidation);
let scheduled = false;
function scheduleRevalidation() {
    if (scheduled) {
        return;
    }
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        try {
            revalidate();
            renderNotifiers.forEach(([resolve]) => resolve());
        }
        catch (err) {
            renderNotifiers.forEach(([, reject]) => reject(err));
        }
        renderNotifiers = [];
    }, 0);
}
function revalidate() {
    for (const result of results) {
        const { env } = result;
        env.begin();
        result.rerender();
        env.commit();
    }
}
const resolver = new RuntimeResolver();
const context = JitContext(new CompileTimeResolver(resolver));
function dictToReference(dict, env) {
    const root = new ComponentRootReference(dict, env);
    return Object.keys(dict).reduce((acc, key) => {
        acc[key] = root.get(key);
        return acc;
    }, {});
}
function getTemplateIterator(ComponentClass, element, envOptions, envDelegate, componentArgs = {}, owner = DEFAULT_OWNER) {
    const runtime = JitRuntime(envOptions, envDelegate, context, resolver);
    const builder = clientBuilder(runtime.env, {
        element,
        nextSibling: null,
    });
    const handle = resolver.registerRoot(ComponentClass);
    let dynamicScope;
    if (owner) {
        dynamicScope = new DefaultDynamicScope({
            [OWNER_KEY]: new ConstReference(owner),
        });
    }
    return renderJitComponent(runtime, builder, context, 0, handle, dictToReference(componentArgs, runtime.env), dynamicScope);
}

export { setOwner as a, setComponentManager as b, capabilities as c, setModifierManager as d, capabilities$1 as e, renderComponent as r, setComponentTemplate as s, trackedData as t };
