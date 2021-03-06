/* global Prism, MutationObserver */

'use strict'

import { h } from 'dom-chef'
import elementReady from 'element-ready'
import debounce from '../debounce'
import { getFilepathFromElement } from './old-ui/get-file-path'
import { getLanguageClass } from './common/source-handler'
import loadThemeOnce from './prism-themes/load-theme-once'

import './old-ui/fix.css'

const codeContainerObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation =>
        syntaxHighlightSourceCodeLines(
            mutation.target,
            'pre.source:not([class*=language])'
        )
    )
})

let debouncedSideDiffHandler = null

export default function syntaxHighlight(diff, afterWordDiff, theme) {
    loadThemeOnce(theme)

    // File was only renamed, there's no diff
    if (diff.querySelector('.content-container')) {
        return
    }
    // Diff failed because pull request is too big
    if (diff.querySelector('div.too-big-message')) {
        return
    }

    const filePath = getFilepathFromElement(diff)
    const languageClass = getLanguageClass(filePath)

    if (!languageClass) {
        return
    }

    if (!diff.classList.contains(languageClass)) {
        diff.classList.add(languageClass)
    }

    syntaxHighlightSourceCodeLines(diff, 'pre.source:not([class*=language])')

    afterWordDiff(() => {
        syntaxHighlightSourceCodeLines(diff, '.addition pre, .deletion pre')
    })

    const codeContainer = diff.querySelector('.refract-content-container')
    codeContainerObserver.observe(codeContainer, { childList: true })

    // Side by side
    const sideBySideButton = diff.querySelector('button[href*="side-by-side"]')
    // Deleted files don't have side by side
    if (sideBySideButton) {
        sideBySideButton.addEventListener('click', () => {
            if (
                sideBySideButton.attributes.href &&
                sideBySideButton.attributes.href.nodeValue
            ) {
                const args = {
                    languageClass,
                    diffNodeSelector:
                        sideBySideButton.attributes.href.nodeValue,
                }
                highlightSideDiffAsync(args)
                listenForSideDiffScrollAsync(args)
            }
        })
    }
}

async function syntaxHighlightSourceCodeLines(diff, querySelector) {
    const sourceLines = [...diff.querySelectorAll(querySelector)]

    const promises = sourceLines.map(
        preElement =>
            new Promise(resolve => {
                const { classList, firstChild, innerText } = preElement

                if (firstChild.$$rbb_isSyntaxHighlighted) {
                    resolve()
                    return
                }

                // Lines over the arbitrary max length of 9999 will be considered as minified
                if (innerText && innerText.length > 9999) {
                    resolve()
                    return
                }

                Prism.highlightElement(preElement)

                classList.add('__rbb_syntax_highlight')
                // eslint-disable-next-line camelcase
                firstChild.$$rbb_isSyntaxHighlighted = true

                resolve()
            })
    )

    await Promise.all(promises)
}

async function highlightSideDiffAsync({ languageClass, diffNodeSelector }) {
    const sideBySide = document.querySelector(diffNodeSelector)
    sideBySide.classList.add(languageClass)

    await elementReady(`${diffNodeSelector} pre`, { target: sideBySide })

    await syntaxHighlightSourceCodeLines(sideBySide)
}

async function listenForSideDiffScrollAsync({
    languageClass,
    diffNodeSelector,
}) {
    const scrollersSelector = 'div.aperture-pane-scroller'

    await elementReady(scrollersSelector, { target: document })

    const scrollers = [...document.querySelectorAll(scrollersSelector)]

    if (debouncedSideDiffHandler) {
        scrollers.forEach(scroller => {
            scroller.removeEventListener('scroll', debouncedSideDiffHandler)
        })
    }

    debouncedSideDiffHandler = debounce(
        () => highlightSideDiffAsync({ languageClass, diffNodeSelector }),
        250
    )

    scrollers.forEach(scroller => {
        scroller.addEventListener('scroll', debouncedSideDiffHandler)
    })
}
