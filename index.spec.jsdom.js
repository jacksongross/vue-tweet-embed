import test from 'ava'
import jsdom from 'jsdom'
import decache from 'decache'
import fs from 'fs'
import { spy } from 'simple-spy'

const { JSDOM } = jsdom

const loadVueIntoWindow = (window) => {
    const vueFilePath = require.resolve('vue/dist/vue.global.js')
    window.eval(String(fs.readFileSync(vueFilePath)))
    return window.Vue
}

const createEnv = (scripts = []) => {
    return new Promise((resolve, reject) => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: "outside-only",
            // will not log browser events to console
            virtualConsole: new jsdom.VirtualConsole()
        })
        const window = dom.window
        const document = window.document
        const navigator = window.navigator
        const Vue = loadVueIntoWindow(window)

        // require a new instance of Tweet every time to avoid side-effects
        const { Tweet, Moment, Timeline } = require('./dist')

        // window and document needs to be global
        // (required by vue's Ctor.$mount)
        global.window = window
        global.document = document
        global.navigator = navigator
        resolve({ Vue, Tweet, Moment, Timeline, window, document })
    })
}

test.beforeEach(t => {
    return createEnv().then(data => {
        t.context = data
    })
})

test.afterEach(() => {
    // remove old cached every time to avoid side-effects
    decache('./dist')
    decache('./dist/tweet')
    decache('./dist/moment')
    decache('./dist/timeline')
})

// CORE TESTS (injecting platform script)
test('Tweet Should be available on module level as well as per-component level', t => {
    const { Tweet } = require('./dist')
    t.truthy(Tweet)
    t.truthy(Tweet.data)
    const TweetL = require('./dist/tweet').default
    t.truthy(TweetL)
    t.is(Tweet, TweetL)
})

test('Moment Should be available on module level as well as per-component level', t => {
    const { Moment } = require('./dist')
    t.truthy(Moment)
    t.truthy(Moment.data)
    const MomentL = require('./dist/moment').default
    t.truthy(MomentL)
    t.is(Moment, MomentL)
})

test('Timeline Should be available on module level as well as per-component level', t => {
    const { Timeline } = require('./dist')
    t.truthy(Timeline)
    t.truthy(Timeline.data)
    const TimelineL = require('./dist/timeline').default
    t.truthy(TimelineL)
    t.is(Timeline, TimelineL)
})

test('Should inject twitter embed script if none is given', t => {
    const { Tweet, Vue, document } = t.context
    Vue.createApp(Tweet).mount('body')

    const $script = document.querySelector('script[src="//platform.twitter.com/widgets.js"]')
    t.true($script !== null)
})

test('Should not inject more than one script par page', t => {
    const { Tweet, Vue, document } = t.context

    const TweetPage = {
        components: { Tweet },
        template: '<div><Tweet v-for="i in [1, 2, 3]"/></div>'
    }

    Vue.createApp(TweetPage).mount('body')

    const $scripts = document.querySelectorAll('script[src="//platform.twitter.com/widgets.js"]')
    t.is($scripts.length, 1)
})

// TWEET COMPONENT TEST
test.cb('Should show a newly created Tweet element as tweet\'s immeditate child', t => {
    const { Tweet, Vue, window, document } = t.context
    const mockTwttr = {
        widgets: {
            createTweetEmbed: spy((tweetId, parent) => {
                const $mockTweet = document.createElement('div')
                $mockTweet.setAttribute('id', 'loadedTweet')
                $mockTweet.innerText = 'tweet text'
                parent.appendChild($mockTweet)
                return Promise.resolve($mockTweet)
            })
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Tweet id="123" :options="{foo:\'bar\'}"></Tweet>',
        components: { Tweet }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        // check that library was called with correct options
        t.is(mockTwttr.widgets.createTweetEmbed.callCount, 1)
        t.is(mockTwttr.widgets.createTweetEmbed.args[0].length, 3)
        t.is(mockTwttr.widgets.createTweetEmbed.args[0][0], '123')
        t.is(mockTwttr.widgets.createTweetEmbed.args[0][1], vm.$el)
        t.deepEqual(mockTwttr.widgets.createTweetEmbed.args[0][2], { foo: 'bar' })

        // check that the element was indeed injected
        const $loadedTweet = vm.$el.querySelector('#loadedTweet')
        t.is($loadedTweet.id, 'loadedTweet')
        t.is($loadedTweet.innerText, 'tweet text')
        t.end()
    }, 0)
})

test.cb('Should show an error message when tweet cannot be fetched', t => {
    const { Tweet, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTweetEmbed: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Tweet id="14"></Tweet>',
        components: { Tweet }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'Whoops! We couldn\'t access this Tweet.')
        t.is($tweetContents.className, '')
        t.end()
    }, 0)
})

test.cb('Should show a custom error message when tweet cannot be fetched and params are given', t => {
    const { Tweet, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTweetEmbed: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Tweet error-message="why you no work" error-message-class="tweet-error" id="14"></Tweet>',
        components: { Tweet }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'why you no work')
        t.is($tweetContents.className, 'tweet-error')
        t.end()
    }, 0)
})

test.cb('Should show children while tweet is not loaded', t => {
    const { Tweet, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTweetEmbed: () => {
                // emulate tweet being loaded
                return Promise.resolve()
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Tweet id="123"><div id="foo">hi</div></Tweet>',
        components: { Tweet }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    t.truthy(vm.$el.querySelector('#foo'))
    setTimeout(() => {
        t.falsy(vm.$el.querySelector('#foo'))
        t.end()
    }, 0)
})

// Tests for Moment component
test.cb('Should show a newly created Moment element as tweet\'s immeditate child', t => {
    const { Moment, Vue, window, document } = t.context
    const mockTwttr = {
        widgets: {
            createMoment: spy((tweetId, parent) => {
                const $mockTweet = document.createElement('div')
                $mockTweet.setAttribute('id', 'loadedTweet')
                $mockTweet.innerText = 'tweet text'
                parent.appendChild($mockTweet)
                return Promise.resolve($mockTweet)
            })
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Moment id="123" :options="{foo:\'bar\'}"></Moment>',
        components: { Moment }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        // check that library was called with correct options
        t.is(mockTwttr.widgets.createMoment.callCount, 1)
        t.is(mockTwttr.widgets.createMoment.args[0].length, 3)
        t.is(mockTwttr.widgets.createMoment.args[0][0], '123')
        t.is(mockTwttr.widgets.createMoment.args[0][1], vm.$el)
        t.deepEqual(mockTwttr.widgets.createMoment.args[0][2], { foo: 'bar' })

        // check that the element was indeed injected
        const $loadedTweet = vm.$el.querySelector('#loadedTweet')
        t.is($loadedTweet.id, 'loadedTweet')
        t.is($loadedTweet.innerText, 'tweet text')
        t.end()
    }, 0)
})

test.cb('Should show an error message when moment cannot be fetched', t => {
    const { Moment, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createMoment: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Moment id="14"></Moment>',
        components: { Moment }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'Whoops! We couldn\'t access this Moment.')
        t.is($tweetContents.className, '')
        t.end()
    }, 0)
})

test.cb('Should show a custom error message when moment cannot be fetched and params are given', t => {
    const { Moment, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createMoment: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Moment error-message="why you no work" error-message-class="moment-error" id="14"></Moment>',
        components: { Moment }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'why you no work')
        t.is($tweetContents.className, 'moment-error')
        t.end()
    }, 0)
})

test.cb('Should show children while moment is not loaded', t => {
    const { Moment, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createMoment: () => {
                // emulate tweet being loaded
                return Promise.resolve()
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Moment id="123"><div id="foo">hi</div></Moment>',
        components: { Moment }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    t.truthy(vm.$el.querySelector('#foo'))
    setTimeout(() => {
        t.falsy(vm.$el.querySelector('#foo'))
        t.end()
    }, 0)
})

// Tests for Timeline component
test.cb('Should show a newly created Timeline element as tweet\'s immeditate child', t => {
    const { Timeline, Vue, window, document } = t.context
    const mockTwttr = {
        widgets: {
            createTimeline: spy((userId, parent) => {
                const $mockTweet = document.createElement('div')
                $mockTweet.setAttribute('id', 'loadedTweet')
                $mockTweet.setAttribute('sourceType', 'loadedSouceType')
                $mockTweet.innerText = 'tweet text'
                parent.appendChild($mockTweet)
                return Promise.resolve($mockTweet)
            })
        }
    }

    window.twttr = mockTwttr

    const Ctor = {
        template: '<Timeline id="123" sourceType="profile" :options="{foo:\'bar\'}"></Timeline>',
        components: { Timeline }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        // check that library was called with correct options
        t.is(mockTwttr.widgets.createTimeline.callCount, 1)
        t.is(mockTwttr.widgets.createTimeline.args[0].length, 3)
        t.is(mockTwttr.widgets.createTimeline.args[0][0]['screenName'], '123')
        t.is(mockTwttr.widgets.createTimeline.args[0][0]['sourceType'], 'profile')
        t.is(mockTwttr.widgets.createTimeline.args[0][1], vm.$el)
        t.deepEqual(mockTwttr.widgets.createTimeline.args[0][2], { foo: 'bar' })

        // check that the element was indeed injected
        const $loadedTweet = vm.$el.querySelector('#loadedTweet')

        t.is($loadedTweet.id, 'loadedTweet')
        t.is($loadedTweet.innerText, 'tweet text')
        t.end()
    }, 0)
})

test.cb('Should show a newly created Timeline element as list\'s immeditate child', t => {
    const { Timeline, Vue, window, document } = t.context
    const mockTwttr = {
        widgets: {
            createTimeline: spy((userId, parent) => {
                const $mockTweet = document.createElement('div')
                $mockTweet.setAttribute('id', 'loadedTweet')
                $mockTweet.setAttribute('sourceType', 'loadedSouceType')
                $mockTweet.innerText = 'tweet text'
                parent.appendChild($mockTweet)
                return Promise.resolve($mockTweet)
            })
        }
    }

    window.twttr = mockTwttr

    const Ctor = {
        template: '<Timeline sourceType="list" id="TwitterDev" slug="national-parks" :options="{foo:\'bar\'}"></Timeline>',
        components: { Timeline }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        // check that library was called with correct options
        t.is(mockTwttr.widgets.createTimeline.callCount, 1)
        t.is(mockTwttr.widgets.createTimeline.args[0].length, 3)
        t.is(mockTwttr.widgets.createTimeline.args[0][0]['sourceType'], 'list')
        t.is(mockTwttr.widgets.createTimeline.args[0][0]['ownerScreenName'], 'TwitterDev')
        t.is(mockTwttr.widgets.createTimeline.args[0][0]['slug'], 'national-parks')
        t.is(mockTwttr.widgets.createTimeline.args[0][1], vm.$el)
        t.deepEqual(mockTwttr.widgets.createTimeline.args[0][2], { foo: 'bar' })

        // check that the element was indeed injected
        const $loadedTweet = vm.$el.querySelector('#loadedTweet')

        t.is($loadedTweet.id, 'loadedTweet')
        t.is($loadedTweet.innerText, 'tweet text')
        t.end()
    }, 0)
})

test.cb('Should show an error message when timeline cannot be fetched', t => {
    const { Timeline, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTimeline: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Timeline id="14" sourceType="profile"></Timeline>',
        components: { Timeline }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'Whoops! We couldn\'t access this Timeline.')
        t.is($tweetContents.className, '')
        t.end()
    }, 0)
})

test.cb('Should show a custom error message when timeline cannot be fetched and params are given', t => {
    const { Timeline, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTimeline: (tweetId, parent) => {
                const $mockTweet = undefined // tweet not found
                return Promise.resolve($mockTweet)
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Timeline error-message="why you no work" error-message-class="timeline-error" id="14"></Timeline>',
        components: { Timeline }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    setTimeout(() => {
        const $tweetContents = vm.$el.firstChild
        t.is($tweetContents.innerHTML, 'why you no work')
        t.is($tweetContents.className, 'timeline-error')
        t.end()
    }, 0)
})

test.cb('Should show children timeline tweet is not loaded', t => {
    const { Timeline, Vue, window } = t.context
    const mockTwttr = {
        widgets: {
            createTimeline: () => {
                // emulate tweet being loaded
                return Promise.resolve()
            }
        }
    }
    window.twttr = mockTwttr

    const Ctor = {
        template: '<Timeline id="123" sourceType="profile"><div id="foo">hi</div></Timeline>',
        components: { Timeline }
    }
    const vm = Vue.createApp(Ctor).mount('body')

    t.truthy(vm.$el.querySelector('#foo'))
    setTimeout(() => {
        t.falsy(vm.$el.querySelector('#foo'))
        t.end()
    }, 0)
})
