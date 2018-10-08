/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as ResourceTiming from '../resource-timing';
import * as lolex from 'lolex';
import {ExpansionOptions, installVariableService} from '../variables';
import {RequestHandler, expandPostMessage} from '../requests';
import {dict} from '../../../../src/utils/object';
import {macroTask} from '../../../../testing/yield';

describes.realWin('Requests', {amp: 1}, env => {
  let ampdoc;
  let analyticsMock;
  let clock;
  let preconnect;
  let preconnectSpy;

  beforeEach(() => {
    installVariableService(env.win);
    ampdoc = env.ampdoc;
    ampdoc.defaultView = env.win;
    analyticsMock = {
      nodeType: 1,
      ownerDocument: ampdoc,
      getAmpDoc: function() { return ampdoc; },
    };
    clock = lolex.install({target: ampdoc.win});
    preconnectSpy = sandbox.spy();
    preconnect = {
      url: preconnectSpy,
    };
  });

  afterEach(() => {
    clock.uninstall();
  });

  describe('RequestHandler', () => {
    describe('batch', () => {
      it('should batch multiple send', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r2', 'batchInterval': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        handler.send({}, {}, expansionOptions, {});
        clock.tick(500);
        handler.send({}, {}, expansionOptions, {});
        clock.tick(500);
        yield macroTask();
        expect(spy).to.be.calledOnce;
      });

      it('should work properly with no batch', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r1'};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        handler.send({}, {}, expansionOptions, {});
        yield macroTask();
        expect(spy).to.be.calledTwice;
      });


      it('should preconnect', function* () {
        const r = {'baseUrl': 'r2?cid=CLIENT_ID(scope)&var=${test}'};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: sandbox.spy()}, false);
        const expansionOptions = new ExpansionOptions({'test': 'expanded'});
        handler.send({}, {}, expansionOptions, {});
        yield macroTask();
        expect(preconnectSpy).to.be.calledWith(
            'r2?cid=CLIENT_ID(scope)&var=expanded');
      });
    });

    describe('batch with batchInterval', () => {
      let spy;
      let transport;
      beforeEach(() => {
        spy = sandbox.spy();
        transport = {sendRequest: spy};
      });

      it('should support number', () => {
        const r = {'baseUrl': 'r1', 'batchInterval': 5};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        expect(handler.batchIntervalPointer_).to.not.be.null;
        expect(handler.batchInterval_).to.deep.equal([5000]);
      });

      it('should support array', () => {
        const r = {'baseUrl': 'r1', 'batchInterval': [1, 2, 3]};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        expect(handler.batchIntervalPointer_).to.not.be.null;
        expect(handler.batchInterval_).to.deep.equal([1000, 2000, 3000]);
      });

      it('should check batchInterval is valid', () => {
        //Should be number
        const r1 = {'baseUrl': 'r', 'batchInterval': 'invalid'};
        const r2 = {'baseUrl': 'r', 'batchInterval': ['invalid']};
        try {
          new RequestHandler(analyticsMock, r1, preconnect, transport, false);
          throw new Error('should never happen');
        } catch (e) {
          expect(e).to.match(/Invalid batchInterval value/);
        }
        try {
          new RequestHandler(analyticsMock, r2, preconnect, transport, false);
          throw new Error('should never happen');
        } catch (e) {
          expect(e).to.match(/Invalid batchInterval value/);
        }

        //Should be greater than BATCH_INTERVAL_MIN
        const r3 = {'baseUrl': 'r', 'batchInterval': 0.01};
        const r4 = {'baseUrl': 'r', 'batchInterval': [-1, 5]};
        const r5 = {'baseUrl': 'r', 'batchInterval': [1, 0.01]};
        try {
          new RequestHandler(analyticsMock, r3, preconnect, transport, false);
          throw new Error('should never happen');
        } catch (e) {
          expect(e).to.match(/Invalid batchInterval value/);
        }
        try {
          new RequestHandler(analyticsMock, r4, preconnect, transport, false);
          throw new Error('should never happen');
        } catch (e) {
          expect(e).to.match(/Invalid batchInterval value/);
        }
        try {
          new RequestHandler(analyticsMock, r5, preconnect, transport, false);
          throw new Error('should never happen');
        } catch (e) {
          expect(e).to.match(/Invalid batchInterval value/);
        }
      });

      it('should schedule send request with interval array', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': [1, 2]};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        clock.tick(998);
        handler.send({}, {}, expansionOptions, {});
        clock.tick(2);
        yield macroTask();
        expect(spy).to.be.calledOnce;
        spy.resetHistory();
        handler.send({}, {}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.not.be.called;
        handler.send({}, {}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledOnce;
        spy.resetHistory();
        handler.send({}, {}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.not.be.called;
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledOnce;
      });

      it('should not schedule send request w/o trigger', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': [1]};
        new RequestHandler(analyticsMock, r, preconnect, transport, false);
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.not.be.called;
      });

      it('should schedule send independent of trigger immediate', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': [1, 2]};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        clock.tick(999);
        handler.send({}, {'important': true}, expansionOptions, {});
        yield macroTask();
        expect(spy).to.be.calledOnce;
        spy.resetHistory();
        handler.send({}, {}, expansionOptions, {});
        clock.tick(1);
        yield macroTask();
        expect(spy).to.be.calledOnce;
      });
    });

    describe('reportWindow', () => {
      let spy;
      let transport;
      beforeEach(() => {
        spy = sandbox.spy();
        transport = {sendRequest: spy};
      });

      it('should accept reportWindow with number', () => {
        const r = {'baseUrl': 'r', 'reportWindow': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const r2 = {'baseUrl': 'r', 'reportWindow': '2'};
        const handler2 = new RequestHandler(
            analyticsMock, r2, preconnect, transport, false);
        const r3 = {'baseUrl': 'r', 'reportWindow': 'invalid'};
        const handler3 = new RequestHandler(
            analyticsMock, r3, preconnect, transport, false);
        expect(handler.reportWindow_).to.equal(1);
        expect(handler2.reportWindow_).to.equal(2);
        expect(handler3.reportWindow_).to.be.null;
      });

      it('should stop bathInterval outside batch report window', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': 0.5, 'reportWindow': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        clock.tick(500);
        yield macroTask();
        expect(spy).to.be.calledOnce;
        spy.resetHistory();
        clock.tick(500);
        expect(handler.batchIntervalTimeoutId_).to.be.null;
        handler.send({}, {}, expansionOptions, {});
        clock.tick(500);
        yield macroTask();
        expect(spy).to.not.be.called;
      });

      it('should stop send request outside batch report window', function* () {
        const r = {'baseUrl': 'r', 'reportWindow': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        yield macroTask();
        expect(spy).to.be.calledOnce;
        spy.resetHistory();
        clock.tick(1000);
        handler.send({}, {}, expansionOptions, {});
        yield macroTask();
        expect(spy).to.not.be.called;
      });

      it('should flush batch queue after batch report window', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': 5, 'reportWindow': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledOnce;
      });

      it('should respect immediate trigger', function* () {
        const r = {'baseUrl': 'r', 'batchInterval': 0.2, 'reportWindow': 0.5};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, transport, false);
        const expansionOptions = new ExpansionOptions({});
        clock.tick(500);
        yield macroTask();
        handler.send({}, {}, expansionOptions, {});
        clock.tick(200);
        expect(spy).to.not.be.called;
        handler.send({}, {'important': true}, expansionOptions, {});
      });
    });

    describe('batch segments', () => {
      it('should respect config extraUrlParam', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r1', 'batchInterval': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send({'e1': 'e1'}, {}, expansionOptions, {});
        handler.send({'e1': 'e1'}, {}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledWith('r1?e1=e1&e1=e1');
      });

      it('should respect trigger extraUrlParam', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r1', 'batchInterval': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        const expansionOptions = new ExpansionOptions({'v2': '中'});
        handler.send({}, {
          'extraUrlParams': {
            'e1': 'e1',
            'e2': '${v2}', // check vars are used and not double encoded
          },
        }, expansionOptions, {});
        handler.send(
            {}, {'extraUrlParams': {'e1': 'e1'}}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledWith('r1?e1=e1&e2=%E4%B8%AD&e1=e1');
      });

      it('should replace extraUrlParam', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r1&${extraUrlParams}&r2', 'batchInterval': 1};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        const expansionOptions = new ExpansionOptions({});
        handler.send(
            {}, {'extraUrlParams': {'e1': 'e1'}}, expansionOptions, {});
        handler.send(
            {}, {'extraUrlParams': {'e2': 'e2'}}, expansionOptions, {});
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.calledWith('r1&e1=e1&e2=e2&r2');
      });
    });

    describe('batch plugin', () => {
      it('should throw error when defined on non batched request', () => {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r', 'batchPlugin': '_ping_'};
        try {
          new RequestHandler(
              analyticsMock, r, preconnect, {sendRequest: spy}, false);
        } catch (e) {
          expect(e).to.match(
              /batchPlugin cannot be set on non-batched request/);
        }
      });

      it('should throw error with unsupported batchPlugin', () => {
        const spy = sandbox.spy();
        const r =
            {'baseUrl': 'r', 'batchInterval': 1, 'batchPlugin': 'invalid'};
        try {
          new RequestHandler(
              analyticsMock, r, preconnect, {sendRequest: spy}, false);
        } catch (e) {
          expect(e).to.match(/unsupported batch plugin/);
        }
      });

      it('should handle batchPlugin function error', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r', 'batchInterval': 1, 'batchPlugin': '_ping_'};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        // Overwrite batchPlugin function
        handler.batchingPlugin_ = () => {throw new Error('test');};
        expectAsyncConsoleError(/test/);
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {'extraUrlParams': {'e1': 'e1'}}, expansionOptions);
        clock.tick(1000);
        yield macroTask();
        expect(spy).to.be.not.called;
      });

      it('should pass in correct batchSegments', function* () {
        const spy = sandbox.spy();
        const r = {'baseUrl': 'r', 'batchInterval': 1, 'batchPlugin': '_ping_'};
        const handler = new RequestHandler(
            analyticsMock, r, preconnect, {sendRequest: spy}, false);
        // Overwrite batchPlugin function
        const batchPluginSpy = sandbox.spy(handler, 'batchingPlugin_');
        const expansionOptions = new ExpansionOptions({});
        handler.send({}, {'on': 'timer', 'extraUrlParams': {'e1': 'e1'}},
            expansionOptions);
        clock.tick(5);
        // Test that we decode when pass to batchPlugin function
        handler.send({}, {'on': 'click', 'extraUrlParams': {'e2': '&e2'}},
            expansionOptions);
        clock.tick(5);
        handler.send({}, {'on': 'visible', 'extraUrlParams': {'e3': ''}},
            expansionOptions);
        clock.tick(1000);
        yield macroTask();
        expect(batchPluginSpy).to.be.calledOnce;
        expect(batchPluginSpy).to.be.calledWith('r', [dict({
          'trigger': 'timer',
          'timestamp': 0,
          'extraUrlParams': {
            'e1': 'e1',
          },
        }), dict({
          'trigger': 'click',
          'timestamp': 5,
          'extraUrlParams': {
            'e2': '&e2',
          },
        }), dict({
          'trigger': 'visible',
          'timestamp': 10,
          'extraUrlParams': {
            'e3': '',
          },
        })]);
        expect(spy).to.be.calledOnce;
        expect(spy).to.be.calledWith('testFinalUrl');
      });
    });
  });

  it('should replace dynamic bindings', function* () {
    const spy = sandbox.spy();
    const r = {'baseUrl': 'r1&${resourceTiming}'};
    const handler = new RequestHandler(
        analyticsMock, r, preconnect, {sendRequest: spy}, false);
    const expansionOptions = new ExpansionOptions({
      'resourceTiming': 'RESOURCE_TIMING',
    });
    sandbox.stub(ResourceTiming, 'getResourceTiming')
        .returns(Promise.resolve('resource-timing'));
    handler.send({}, {}, expansionOptions);
    yield macroTask();
    expect(spy).to.be.calledWith('r1&resource-timing');
  });

  describe('expandPostMessage', () => {
    let expansionOptions;
    let analyticsInstanceMock;
    let params;
    beforeEach(() => {
      expansionOptions = new ExpansionOptions({
        'teste1': 'TESTE1',
      });
      analyticsInstanceMock = {
        win: env.win,
        element: analyticsMock,
      };
      params = {
        'e1': '${teste1}',
        'e2': 'teste2',
      };
    });

    it('should expand', () => {
      return expandPostMessage(
          analyticsInstanceMock,
          'test foo 123 ... ${teste1}',
          undefined,
          {},
          expansionOptions).then(msg => {
        expect(msg).to.equal('test foo 123 ... TESTE1');
      });
    });

    it('should replace not append ${extraUrlParams}', () => {
      const replacePromise = expandPostMessage(
          analyticsInstanceMock,
          'test ${extraUrlParams} foo',
          params, /* configParams */
          {}, /* trigger */
          expansionOptions);
      const appendPromise = expandPostMessage(
          analyticsInstanceMock,
          'test foo',
          params, /* configParams */
          {}, /* trigger */
          expansionOptions);
      return replacePromise.then(replace => {
        expect(replace).to.equal('test e1=TESTE1&e2=teste2 foo');
        expect(appendPromise).to.eventually.equal('test foo');
      });
    });
  });
});
