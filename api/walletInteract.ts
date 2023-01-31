import algosdk from 'algosdk';

export const importAccount = () => {
  const account = algosdk.mnemonicToSecretKey(
    // 'bonus fabric wise whale possible bunker ritual rhythm element stable sad deposit doll promote museum fun giggle peasant crash retreat beauty rigid gadget absorb rib',
    // 'segment enable urban basket problem relief rent flower power shrug differ advice lobster occur lawn exact agree blame worth version admit robust expose able cost',
    'warrior raven future donkey foster beyond short wealth city gentle rebuild gauge poem impose muscle anxiety cake supreme emotion release weasel basic empower absent dismiss'
  );
  console.log('private key', account.sk);
  return account;
};

export const initClient = (): algosdk.Algodv2 => {
  const algodToken = { 'X-API-KEY': '6EbKQ0TN6n6QyFOKJxWb5aoQGe4J0t5660qg3PSE' };
  const algodServer = 'https://testnet-algorand.api.purestake.io/ps2';
  const algodPort = '';
  const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

  return algodClient;
};

export const getListNFT = async (user: string) => {
  let algodClient = initClient();

  let info = await algodClient.accountInformation(user).do();
  const assets = info['assets'];
  return assets;
};

export const getBalance = async (user: string) => {
  let algodClient = await initClient();
  let info = await algodClient.accountInformation(user).do();
  const balance = info['amount'];
  return balance;
};

export const mintNFT = async () => {
  let myAccount = importAccount();
  let algodClient = initClient();

  let params = await algodClient.getTransactionParams().do();
  console.log(params);

  let txn = algosdk.makeAssetCreateTxnWithSuggestedParams(
    myAccount.addr,
    new Uint8Array(0),
    10,
    0,
    false,
    myAccount.addr,
    myAccount.addr,
    myAccount.addr,
    myAccount.addr,
    'HUY NFT',
    'HUY NFTS',
    // 'ipfs://',
    'https://news.artnet.com/app/news-upload/2022/06/94263c4219a6ae9b68fc8b127db10b8c.png',
    '',
    params,
  );

  let txId = txn.txID().toString();

  let signedTxn = txn.signTxn(myAccount.sk);
  console.log('Signed transaction with txID: %s', txId);

  // Submit the transaction
  await algodClient.sendRawTransaction(signedTxn).do();
  // Wait for transaction to be confirmed
  let confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
  console.log(confirmedTxn);

  //Get the completed Transaction
  console.log('Transaction ' + txId + ' confirmed in round ' + confirmedTxn['confirmed-round']);
  // display results
  let transactionResponse = await algodClient.pendingTransactionInformation(txId).do();
  console.log('transactionResponse', transactionResponse);
  let assetId = transactionResponse['asset-index'];
  console.log('Created new asset-index: ', assetId);
  return assetId;
};
