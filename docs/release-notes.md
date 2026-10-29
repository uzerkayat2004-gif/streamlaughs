# StreamLaughs v0.6.3

see who's laughing with you.

- Edge Add-ons support: separate store identity and automatic browser updates; ZIP installs retain the popup update flow.
- Store submission ZIP contains one manifest.json and no manifest key; bundled model receipts use model-files.json.
- Recaps and settings stay in your browser. Microphone diagnostics and all local models remain bundled.
- Audio is processed on your PC and never saved or sent. Sharing is optional.

First install: download the universal ZIP from the website, extract it, enable Developer mode on your browser’s extensions page, then Load unpacked from the folder containing manifest.json. Pin the icon, finish Welcome and press start on a Twitch stream. Future updates: use the popup, copy the new files into the same existing folder, then press finish update. Installs older than v0.6.2 need one manual folder replacement and reload to receive this flow.

Fixed unpacked ID: fkocldgggcmhihelohiicoakcfomhepg. The manifest public key is sufficient; no private signing key is used or included. SHA256SUMS.txt verifies the ZIP downloads. Models, runtimes and third-party notices are included.

Edge Add-ons submission is in review. The website lists ZIP installation until the owner provides the approved store URL. Microphone consent is requested locally. Physical Twitch audio, real OAuth and the manual acceptance checklist still require the release owner’s verification.
