STARTER NOTES (bundled example, written by the Haunted Ink author; not model output)

Topic: how sequence models carry information over long distances.

- LSTM (Hochreiter & Schmidhuber, Neural Computation 1997) [@hochreiter1997]: gated memory cell, so error can flow back over long time lags without vanishing. Gates decide what to write, keep, erase.
- Residual learning (He et al., CVPR 2016) [@he2016]: each block learns a correction to its input; identity shortcut makes very deep nets trainable. Same "let the signal pass unchanged" idea, across layers instead of time.
- Transformer (Vaswani et al., 2017, arXiv) [@vaswani2017]: attention only, no recurrence; every position looks at every other position.
- Survey framing: deep learning review in Nature (LeCun, Bengio, Hinton 2015) [@lecun2015].
- Claim I want to make, no source yet: the cost of full attention grows with the square of the input length, which is why long contexts are still an engineering problem.
- Claim I want to make, no source yet: gated recurrence, residual shortcuts and attention are three answers to one problem (keeping information alive over distance).
- Open question: does a resolving DOI tell a reader anything about whether a cited paper supports the sentence? (No: it only says the identifier exists.)
