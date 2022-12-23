import React, { useEffect, useState } from 'react';
import NFTItem from './NFTItem';
import styles from '../styles/NFTList.module.scss';

interface Props {
  nft: Array<any>;
  chooseProduct?: (imageUrl: string, idx: number) => void;
}

const NFTList: React.FC<Props> = ({ nft, chooseProduct }) => {
  const [choosen, setChoosen] = useState(-1);

  const handleClicked = (idx: number) => {
    setChoosen(idx);
    chooseProduct && chooseProduct(nft[idx].image, idx);
  };

  return (
    <div className={styles.myListNFTs}>
      {nft.map((item, index) => {
        let tempItem = item.image.split('.');
        if (
          tempItem[tempItem.length - 1] === 'jpeg' ||
          tempItem[tempItem.length - 1] === 'png' ||
          tempItem[tempItem.length - 1] === 'jpg'
        ) {
          return (
            <NFTItem
              image={item.image}
              key={index}
              idx={index}
              handleClicked={handleClicked}
              isChoose={choosen === index ? true : false}
            />
          );
        }
      })}
    </div>
  );
};

export default NFTList;
